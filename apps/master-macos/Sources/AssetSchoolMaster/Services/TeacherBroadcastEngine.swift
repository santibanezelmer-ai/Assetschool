import Foundation
import AppKit
@preconcurrency import WebRTC
import ScreenCaptureKit
import CoreMedia
import CoreGraphics

public class TeacherScreenCapturer: RTCVideoCapturer {
    public func capture(pixelBuffer: CVPixelBuffer) {
        let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let timeStampNs = Int64(Date().timeIntervalSince1970 * 1_000_000_000)
        let frame = RTCVideoFrame(buffer: rtcPixelBuffer, rotation: ._0, timeStampNs: timeStampNs)
        self.delegate?.capturer(self, didCapture: frame)
    }
}

/// Native macOS Screen Broadcast Engine for AssetSchool Master.
/// Captures physical display via ScreenCaptureKit (SCStream) and publishes
/// real H.264 video frames over native WebRTC to Mediasoup SFU.
public class TeacherBroadcastEngine: NSObject, RTCPeerConnectionDelegate, SCStreamOutput, SCStreamDelegate {
    private var factory: RTCPeerConnectionFactory
    private var peerConnection: RTCPeerConnection?
    private var videoSource: RTCVideoSource?
    private var videoTrack: RTCVideoTrack?
    private var capturer: TeacherScreenCapturer?
    private var scStream: SCStream?
    
    private let sampleQueue = DispatchQueue(label: "com.assetschool.master.screencapture.queue", qos: .userInteractive)
    
    public var onLocalCandidate: (@Sendable (String, String, Int32) -> Void)?
    public var onConnectionStateChanged: (@Sendable (RTCIceConnectionState) -> Void)?
    
    public private(set) var isConnected: Bool = false
    public private(set) var isCapturing: Bool = false
    public private(set) var currentSessionId: String = ""
    public private(set) var hasTccPermission: Bool = false
    
    public var allowSyntheticFrames: Bool = true
    public private(set) var frameSource: String = "none"

    public override init() {
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        self.factory = RTCPeerConnectionFactory(encoderFactory: encoderFactory, decoderFactory: decoderFactory)
        super.init()
        self.hasTccPermission = CGPreflightScreenCaptureAccess()
    }
    
    deinit {
        stop()
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
        self.capturer = TeacherScreenCapturer(delegate: source)
        
        let track = factory.videoTrack(with: source, trackId: "teacher-screen-video")
        self.videoTrack = track
        
        guard let pc = factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            fatalError("[TEACHER BROADCAST ERROR] No se pudo inicializar RTCPeerConnection nativo.")
        }
        
        pc.add(track, streamIds: ["assetschool-teacher-screen"])
        self.peerConnection = pc
        return pc
    }
    
    public func startBroadcast(sessionId: String = UUID().uuidString, width: Int = 1920, height: Int = 1080, fps: Int = 30) async throws -> String {
        self.currentSessionId = sessionId
        let pc = setupPeerConnection()
        
        // Start physical or synthetic screen capture
        try await startScreenCapture(width: width, height: height, fps: fps)
        
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveVideo": "false",
                "OfferToReceiveAudio": "false"
            ],
            optionalConstraints: [
                "DtlsSrtpKeyAgreement": "true"
            ]
        )
        
        // Create local offer
        let offer = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            pc.offer(for: constraints) { sdp, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let sdp = sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: NSError(domain: "WebRTC", code: -1, userInfo: [NSLocalizedDescriptionKey: "SDP Offer nulo"]))
                }
            }
        }
        
        // Set local description
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(offer) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
        
        // Wait briefly for initial host candidate gathering (up to 800ms)
        let sdpWithCandidates = await waitForIceCandidates(pc: pc, timeoutSeconds: 0.8)
        print("[TEACHER BROADCAST] Oferta SDP nativa generada con éxito (\(sdpWithCandidates.count) bytes).")
        return sdpWithCandidates
    }
    
    public func handleRemoteAnswer(sdpAnswer: String) async throws {
        guard let pc = self.peerConnection else {
            throw NSError(domain: "WebRTC", code: -1, userInfo: [NSLocalizedDescriptionKey: "PeerConnection no inicializado"])
        }
        
        let sessionDesc = RTCSessionDescription(type: .answer, sdp: sdpAnswer)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sessionDesc) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    print("[TEACHER BROADCAST] Remote SDP Answer establecida exitosamente en RTCPeerConnection.")
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
                print("[TEACHER BROADCAST ERROR] Error agregando candidato ICE: \(error)")
            }
        }
    }
    
    // MARK: - Screen Capture (ScreenCaptureKit)
    
    private func startScreenCapture(width: Int, height: Int, fps: Int) async throws {
        self.hasTccPermission = CGPreflightScreenCaptureAccess()
        
        if !hasTccPermission {
            print("[TEACHER BROADCAST] AVISO: Permiso de Grabación de pantalla TCC no concedido para Master.")
            _ = CGRequestScreenCaptureAccess()
            if allowSyntheticFrames {
                print("[TEACHER BROADCAST] --synthetic-frames activo: emitiendo señal patrón en CVPixelBuffer.")
                frameSource = "synthetic"
                startSyntheticFrameGenerator(width: width, height: height, fps: fps)
                self.isCapturing = true
                return
            }
            frameSource = "none"
            throw NSError(domain: "ScreenCaptureKit", code: 403, userInfo: [NSLocalizedDescriptionKey: "Permiso de grabación de pantalla no concedido en Ajustes del Sistema."])
        }
        
        print("[TEACHER BROADCAST] TCC concedido. Inicializando SCStream con ScreenCaptureKit...")
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            if allowSyntheticFrames {
                print("[TEACHER BROADCAST] Sin pantalla física: emitiendo señal patrón.")
                frameSource = "synthetic"
                startSyntheticFrameGenerator(width: width, height: height, fps: fps)
                self.isCapturing = true
                return
            }
            frameSource = "none"
            throw NSError(domain: "ScreenCaptureKit", code: 404, userInfo: [NSLocalizedDescriptionKey: "No se detectó pantalla física disponible."])
        }
        
        frameSource = "screencapturekit"
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let streamConfig = SCStreamConfiguration()
        streamConfig.width = width
        streamConfig.height = height
        streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
        streamConfig.queueDepth = 5
        streamConfig.pixelFormat = kCVPixelFormatType_32BGRA
        streamConfig.showsCursor = true
        
        let stream = SCStream(filter: filter, configuration: streamConfig, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        try await stream.startCapture()
        self.scStream = stream
        self.isCapturing = true
        print("[TEACHER BROADCAST] SCStream activo a \(width)x\(height) @ \(fps) FPS.")
    }
    
    // SCStreamOutput Delegate
    public func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        self.capturer?.capture(pixelBuffer: imageBuffer)
    }
    
    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[TEACHER BROADCAST ERROR] SCStream detenido con error: \(error.localizedDescription)")
        self.isCapturing = false
    }
    
    // MARK: - Synthetic Frame Generator (Testbench & Fallback)
    
    private var syntheticTimer: DispatchSourceTimer?
    
    private func startSyntheticFrameGenerator(width: Int, height: Int, fps: Int) {
        stopSyntheticFrameGenerator()
        let timer = DispatchSource.makeTimerSource(queue: sampleQueue)
        let interval = 1.0 / Double(fps)
        timer.schedule(deadline: .now(), repeating: interval)
        
        var frameCount: Int = 0
        timer.setEventHandler { [weak self] in
            guard let self = self, let capturer = self.capturer else { return }
            frameCount += 1
            if let pixelBuffer = self.createTestPixelBuffer(width: width, height: height, frameIndex: frameCount) {
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
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            attrs as CFDictionary,
            &pixelBuffer
        )
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }
        
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
        ) else { return nil }
        
        // Background: Professional dark slate blue (AssetSchool Master palette)
        context.setFillColor(red: 0.08, green: 0.11, blue: 0.18, alpha: 1.0)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        
        // Header bar
        context.setFillColor(red: 0.15, green: 0.22, blue: 0.35, alpha: 1.0)
        context.fill(CGRect(x: 0, y: height - 80, width: width, height: 80))
        
        // Animated indicator box
        let sweepX = CGFloat((frameIndex * 8) % max(1, width - 100))
        context.setFillColor(red: 0.20, green: 0.65, blue: 0.90, alpha: 1.0)
        context.fill(CGRect(x: sweepX, y: CGFloat(height / 2 - 50), width: 100, height: 100))
        
        return buffer
    }
    
    private func waitForIceCandidates(pc: RTCPeerConnection, timeoutSeconds: Double) async -> String {
        let start = Date()
        while Date().timeIntervalSince(start) < timeoutSeconds {
            if pc.iceGatheringState == .complete { break }
            try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }
        return pc.localDescription?.sdp ?? ""
    }
    
    // MARK: - RTCPeerConnectionDelegate
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("[TEACHER BROADCAST] Signaling State: \(stateChanged.rawValue)")
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    public func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[TEACHER BROADCAST] ICE Connection State: \(newState.rawValue)")
        if newState == .connected || newState == .completed {
            self.isConnected = true
        } else if newState == .disconnected || newState == .failed || newState == .closed {
            self.isConnected = false
        }
        self.onConnectionStateChanged?(newState)
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[TEACHER BROADCAST] ICE Gathering State: \(newState.rawValue)")
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("[TEACHER BROADCAST] Candidato ICE generado: \(candidate.sdpMid ?? "0"): \(candidate.sdp)")
        self.onLocalCandidate?(candidate.sdp, candidate.sdpMid ?? "0", candidate.sdpMLineIndex)
    }
    
    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
    
    // MARK: - Teardown
    
    public func stop() {
        print("[TEACHER BROADCAST] Deteniendo motor de transmisión docente...")
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
        isCapturing = false
        currentSessionId = ""
        print("[TEACHER BROADCAST] Recursos WebRTC y SCStream liberados.")
    }
}
