import Foundation
@preconcurrency import WebRTC
import ScreenCaptureKit
import CoreMedia
import CoreGraphics

public class ScreenCapturer: RTCVideoCapturer {
    public func capture(pixelBuffer: CVPixelBuffer) {
        let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let timeStampNs = Int64(Date().timeIntervalSince1970 * 1_000_000_000)
        let frame = RTCVideoFrame(buffer: rtcPixelBuffer, rotation: ._0, timeStampNs: timeStampNs)
        self.delegate?.capturer(self, didCapture: frame)
    }
}

public class WebRtcNativeEngine: NSObject, RTCPeerConnectionDelegate, SCStreamOutput, SCStreamDelegate {
    private var factory: RTCPeerConnectionFactory
    private var peerConnection: RTCPeerConnection?
    private var videoSource: RTCVideoSource?
    private var videoTrack: RTCVideoTrack?
    private var capturer: ScreenCapturer?
    private var scStream: SCStream?
    
    private let sampleQueue = DispatchQueue(label: "com.assetschool.screencapture.queue", qos: .userInteractive)
    
    public var onLocalCandidate: (@Sendable (String, String, Int32) -> Void)?
    public var onConnectionStateChanged: (@Sendable (RTCIceConnectionState) -> Void)?
    
    public private(set) var isConnected: Bool = false
    public private(set) var currentSessionId: String = ""
    public private(set) var hasTccPermission: Bool = false

    /// R0 / S5: synthetic test frames are opt-in only (--synthetic-frames).
    public var allowSyntheticFrames: Bool = false
    /// Origin of the frames of the current stream: "screencapturekit", "synthetic" or "none".
    public private(set) var frameSource: String = "none"

    public enum ScreenCaptureError: Error, LocalizedError {
        case permissionDenied
        case noDisplay

        public var errorDescription: String? {
            switch self {
            case .permissionDenied:
                return "Permiso de Grabación de pantalla no concedido en macOS (Ajustes del Sistema > Privacidad y seguridad)."
            case .noDisplay:
                return "No se detectó ninguna pantalla física para capturar."
            }
        }
    }

    public override init() {
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        self.factory = RTCPeerConnectionFactory(encoderFactory: encoderFactory, decoderFactory: decoderFactory)
        super.init()
        self.hasTccPermission = CGPreflightScreenCaptureAccess()
    }
    
    deinit {
        close()
        RTCCleanupSSL()
    }
    
    public func setupPeerConnection() -> RTCPeerConnection {
        let config = RTCConfiguration()
        config.iceServers = [] // LAN-First: direct peer-to-peer host candidates, zero cloud STUN/TURN
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveVideo": "false",
                "OfferToReceiveAudio": "false"
            ],
            optionalConstraints: [
                "DtlsSrtpKeyAgreement": "true"
            ]
        )
        
        let source = factory.videoSource(forScreenCast: true)
        self.videoSource = source
        self.capturer = ScreenCapturer(delegate: source)
        
        let track = factory.videoTrack(with: source, trackId: "video0")
        self.videoTrack = track
        
        guard let pc = factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            fatalError("[WEBRTC ERROR] No se pudo inicializar RTCPeerConnection nativo.")
        }
        
        pc.add(track, streamIds: ["assetschool-screen"])
        self.peerConnection = pc
        return pc
    }
    
    public func createOffer(sessionId: String, config: ScreenCaptureConfiguration) async throws -> String {
        self.currentSessionId = sessionId
        let pc = setupPeerConnection()
        
        // Start screen capture
        try await startScreenCapture(config: config)
        
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveVideo": "false",
                "OfferToReceiveAudio": "false"
            ],
            optionalConstraints: [
                "DtlsSrtpKeyAgreement": "true"
            ]
        )
        
        return try await withCheckedThrowingContinuation { continuation in
            pc.offer(for: constraints) { sdp, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sdp = sdp else {
                    continuation.resume(throwing: NSError(domain: "WebRTC", code: -1, userInfo: [NSLocalizedDescriptionKey: "SDP nulo"]))
                    return
                }
                
                pc.setLocalDescription(sdp) { setDescError in
                    if let setDescError = setDescError {
                        continuation.resume(throwing: setDescError)
                    } else {
                        print("[WEBRTC NATIVO] Local SDP Offer establecida con éxito (\(sdp.type.rawValue))")
                        continuation.resume(returning: sdp.sdp)
                    }
                }
            }
        }
    }
    
    public func handleAnswer(sdpAnswer: String) async throws {
        guard let pc = self.peerConnection else {
            throw NSError(domain: "WebRTC", code: -1, userInfo: [NSLocalizedDescriptionKey: "PeerConnection no inicializada"])
        }
        
        if pc.signalingState != .haveLocalOffer {
            print("[WEBRTC NATIVO] Remote SDP Answer duplicada ignorada (Signaling state actual: \(pc.signalingState.rawValue)).")
            return
        }
        
        let sessionDesc = RTCSessionDescription(type: .answer, sdp: sdpAnswer)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sessionDesc) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    print("[WEBRTC NATIVO] Remote SDP Answer establecida exitosamente.")
                    continuation.resume()
                }
            }
        }
    }
    
    public func addRemoteCandidate(sdp: String, sdpMid: String?, sdpMLineIndex: Int32) {
        guard let pc = self.peerConnection else { return }
        let candidate = RTCIceCandidate(sdp: sdp, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid)
        pc.add(candidate) { error in
            if let error = error {
                print("[WEBRTC NATIVO ERROR] Error agregando candidato ICE: \(error)")
            } else {
                print("[WEBRTC NATIVO] Candidato ICE remoto agregado.")
            }
        }
    }
    
    // MARK: - Native Screen Capture (ScreenCaptureKit)
    
    private func startScreenCapture(config: ScreenCaptureConfiguration) async throws {
        self.hasTccPermission = CGPreflightScreenCaptureAccess()
        
        if !hasTccPermission {
            print("[SCREENCAPTUREKIT] AVISO: Permiso de Grabación de pantalla (TCC) no concedido para este proceso.")
            print("[SCREENCAPTUREKIT] Solicitando autorización del sistema...")
            _ = CGRequestScreenCaptureAccess()

            // R0 / S5: synthetic frames are only allowed with the explicit
            // --synthetic-frames flag (test benches). Otherwise the missing
            // permission is reported instead of silently sending fake video.
            if allowSyntheticFrames {
                print("[FRAME GENERATOR] --synthetic-frames activo: se enviarán CUADROS SINTÉTICOS (no es la pantalla real).")
                frameSource = "synthetic"
                startSyntheticFrameGenerator(config: config)
                return
            }
            frameSource = "none"
            throw ScreenCaptureError.permissionDenied
        }

        print("[SCREENCAPTUREKIT] TCC concedido. Enumerando pantallas con SCShareableContent...")
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            if allowSyntheticFrames {
                print("[FRAME GENERATOR] Sin pantalla física y --synthetic-frames activo: se enviarán CUADROS SINTÉTICOS.")
                frameSource = "synthetic"
                startSyntheticFrameGenerator(config: config)
                return
            }
            frameSource = "none"
            throw ScreenCaptureError.noDisplay
        }
        frameSource = "screencapturekit"
        
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let streamConfig = SCStreamConfiguration()
        streamConfig.width = config.width
        streamConfig.height = config.height
        streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(config.fps))
        streamConfig.queueDepth = 5
        streamConfig.pixelFormat = kCVPixelFormatType_32BGRA
        streamConfig.showsCursor = true
        
        let stream = SCStream(filter: filter, configuration: streamConfig, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        try await stream.startCapture()
        self.scStream = stream
        print("[SCREENCAPTUREKIT] Captura SCStream activa a \(config.width)x\(config.height)@\(config.fps)fps.")
    }
    
    private var syntheticTimer: DispatchSourceTimer?
    
    private func startSyntheticFrameGenerator(config: ScreenCaptureConfiguration) {
        stopSyntheticFrameGenerator()
        print("[FRAME GENERATOR] Iniciando generador de CVPixelBuffer nativo (\(config.width)x\(config.height) @ \(config.fps) fps)...")
        
        let timer = DispatchSource.makeTimerSource(queue: sampleQueue)
        let interval = 1.0 / Double(config.fps)
        timer.schedule(deadline: .now(), repeating: interval)
        
        var frameCount: Int = 0
        timer.setEventHandler { [weak self] in
            guard let self = self, let capturer = self.capturer else { return }
            frameCount += 1
            if let pixelBuffer = self.createTestPixelBuffer(width: config.width, height: config.height, frameIndex: frameCount) {
                capturer.capture(pixelBuffer: pixelBuffer)
            }
        }
        timer.resume()
        self.syntheticTimer = timer
    }
    
    private func stopSyntheticFrameGenerator() {
        syntheticTimer?.cancel()
        syntheticTimer = nil
    }
    
    private func createTestPixelBuffer(width: Int, height: Int, frameIndex: Int) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        let attributes: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ]
        
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            attributes as CFDictionary,
            &pixelBuffer
        )
        
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }
        
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        
        guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: baseAddress,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }
        
        // Draw native test card with timestamp and animated pulse
        let darkNavy = CGColor(red: 0.05, green: 0.1, blue: 0.2, alpha: 1.0)
        context.setFillColor(darkNavy)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        
        // Animated color pulse indicator
        let phase = Double(frameIndex % 60) / 60.0
        let redVal = CGFloat(0.5 + 0.5 * sin(phase * .pi * 2))
        let pulseColor = CGColor(red: redVal, green: 0.2, blue: 0.8, alpha: 1.0)
        context.setFillColor(pulseColor)
        let boxSize: CGFloat = 80
        context.fill(CGRect(x: CGFloat(width)/2 - boxSize/2, y: CGFloat(height)/2 - boxSize/2, width: boxSize, height: boxSize))
        
        return buffer
    }
    
    // MARK: - SCStreamOutput Delegate
    
    public func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        capturer?.capture(pixelBuffer: imageBuffer)
    }
    
    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[SCREENCAPTUREKIT ERROR] SCStream se detuvo con error: \(error.localizedDescription)")
    }
    
    // MARK: - RTCPeerConnectionDelegate
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("[WEBRTC NATIVO] Signaling State: \(stateChanged.rawValue)")
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    public func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[WEBRTC NATIVO] ICE Connection State: \(newState.rawValue)")
        if newState == .connected || newState == .completed {
            self.isConnected = true
        } else if newState == .disconnected || newState == .failed || newState == .closed {
            self.isConnected = false
        }
        self.onConnectionStateChanged?(newState)
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[WEBRTC NATIVO] ICE Gathering State: \(newState.rawValue)")
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("[WEBRTC NATIVO] Candidato ICE Local generado: \(candidate.sdpMid ?? "mid")[\(candidate.sdpMLineIndex)]: \(candidate.sdp)")
        self.onLocalCandidate?(candidate.sdp, candidate.sdpMid ?? "0", candidate.sdpMLineIndex)
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
    
    // MARK: - Teardown
    
    public func close() {
        print("[WEBRTC NATIVO] Cerrando sesión y liberando recursos nativos...")
        stopSyntheticFrameGenerator()
        if let stream = self.scStream {
            Task {
                try? await stream.stopCapture()
            }
            self.scStream = nil
        }
        peerConnection?.close()
        peerConnection = nil
        videoTrack = nil
        videoSource = nil
        capturer = nil
        isConnected = false
        currentSessionId = ""
        print("[WEBRTC NATIVO] Recursos WebRTC y de captura liberados completamente.")
    }
}
