import Foundation
import AppKit
@preconcurrency import WebRTC
import CoreMedia
import CoreGraphics
import CoreImage

/// Custom RTCVideoRenderer that receives decoded WebRTC video frames (H.264),
/// converts them to native NSImage, and delivers them to TeacherBroadcastManager.
public final class StudentVideoFrameRenderer: NSObject, RTCVideoRenderer {
    public static let shared = StudentVideoFrameRenderer()
    private var isFirstFrame: Bool = true
    private let renderQueue = DispatchQueue(label: "com.assetschool.student.render.queue", qos: .userInteractive)

    public override init() {
        super.init()
    }

    public func setSize(_ size: CGSize) {
        print("[STUDENT RENDERER] Tamaño de video negociado: \(Int(size.width))x\(Int(size.height))")
    }

    public func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame = frame else { return }
        
        if isFirstFrame {
            isFirstFrame = false
            print("[STUDENT RENDERER] ✅ Primer frame de video H.264 recibido y listo para decodificación.")
        }

        let width = CGFloat(frame.width)
        let height = CGFloat(frame.height)

        renderQueue.async { [weak self] in
            guard let self = self else { return }
            var nsImage: NSImage?
            
            if let rtcCVPixelBuffer = frame.buffer as? RTCCVPixelBuffer {
                let pixelBuffer = rtcCVPixelBuffer.pixelBuffer
                let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
                let rep = NSCIImageRep(ciImage: ciImage)
                let img = NSImage(size: NSSize(width: width, height: height))
                img.addRepresentation(rep)
                nsImage = img
            } else if let i420 = frame.buffer as? RTCI420Buffer {
                if let buffer = self.convertI420ToPixelBuffer(i420: i420, width: Int(frame.width), height: Int(frame.height)) {
                    let ciImage = CIImage(cvPixelBuffer: buffer)
                    let rep = NSCIImageRep(ciImage: ciImage)
                    let img = NSImage(size: NSSize(width: width, height: height))
                    img.addRepresentation(rep)
                    nsImage = img
                }
            }
            
            if let finalImage = nsImage {
                TeacherBroadcastManager.shared.updateFrame(image: finalImage)
            }
        }
    }
    
    private func convertI420ToPixelBuffer(i420: RTCI420Buffer, width: Int, height: Int) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
            attrs as CFDictionary,
            &pixelBuffer
        )
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }
        
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        
        guard let yDest = CVPixelBufferGetBaseAddressOfPlane(buffer, 0),
              let uvDest = CVPixelBufferGetBaseAddressOfPlane(buffer, 1) else { return nil }
        
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        let uvStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)
        
        // Copy Y plane
        let ySrc = i420.dataY
        let srcYStride = Int(i420.strideY)
        for row in 0..<height {
            memcpy(yDest.advanced(by: row * yStride), ySrc.advanced(by: row * srcYStride), width)
        }
        
        // Interleave U and V planes into NV12
        let uSrc = i420.dataU
        let vSrc = i420.dataV
        let srcUStride = Int(i420.strideU)
        let srcVStride = Int(i420.strideV)
        let halfHeight = height / 2
        let halfWidth = width / 2
        
        for row in 0..<halfHeight {
            let destRow = uvDest.advanced(by: row * uvStride).assumingMemoryBound(to: UInt8.self)
            let uRow = uSrc.advanced(by: row * srcUStride)
            let vRow = vSrc.advanced(by: row * srcVStride)
            for col in 0..<halfWidth {
                destRow[col * 2] = uRow[col]
                destRow[col * 2 + 1] = vRow[col]
            }
        }
        
        return buffer
    }

    public func reset() {
        self.isFirstFrame = true
    }
}

/// Native macOS WebRTC Engine for receiving and decoding Teacher Screen Broadcast via Mediasoup SFU.
public class TeacherBroadcastReceiverEngine: NSObject, RTCPeerConnectionDelegate {
    private var factory: RTCPeerConnectionFactory
    private var peerConnection: RTCPeerConnection?
    private var remoteVideoTrack: RTCVideoTrack?
    private let renderer = StudentVideoFrameRenderer.shared

    public var onConnectionStateChanged: (@Sendable (RTCIceConnectionState) -> Void)?
    public private(set) var isConnected: Bool = false
    public private(set) var currentClassroomId: String = ""

    public override init() {
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        self.factory = RTCPeerConnectionFactory(encoderFactory: encoderFactory, decoderFactory: decoderFactory)
        super.init()
    }

    deinit {
        stop()
        RTCCleanupSSL()
    }

    public func prepareSubscription(classroomId: String) async throws -> String {
        self.currentClassroomId = classroomId
        stop() // Reset any previous connection
        renderer.reset()

        let config = RTCConfiguration()
        config.iceServers = [] // Direct LAN P2P / SFU host candidates
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveVideo": "true",
                "OfferToReceiveAudio": "false"
            ],
            optionalConstraints: [
                "DtlsSrtpKeyAgreement": "true"
            ]
        )

        guard let pc = factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            throw NSError(domain: "WebRTC", code: -1, userInfo: [NSLocalizedDescriptionKey: "No se pudo crear RTCPeerConnection en Student"])
        }
        self.peerConnection = pc

        // Add receive-only transceiver for Video
        let transceiverInit = RTCRtpTransceiverInit()
        transceiverInit.direction = .recvOnly
        pc.addTransceiver(of: .video, init: transceiverInit)

        // Create SDP Offer
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

        // Wait briefly for initial host candidates
        let sdpWithCandidates = await waitForIceCandidates(pc: pc, timeoutSeconds: 0.8)
        print("[STUDENT SFU RECEIVER] Oferta SDP de suscripción generada (\(sdpWithCandidates.count) bytes).")
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
                    print("[STUDENT SFU RECEIVER] Remote SDP Answer establecida exitosamente en Student.")
                    continuation.resume()
                }
            }
        }
    }

    private func attachTrack(_ track: RTCVideoTrack) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            print("[STUDENT SFU RECEIVER] ✅ Pista de video remota detectada. Conectando decodificador RTCVideoRenderer...")
            if let existing = self.remoteVideoTrack {
                existing.remove(self.renderer)
            }
            self.remoteVideoTrack = track
            track.add(self.renderer)
        }
    }

    private func waitForIceCandidates(pc: RTCPeerConnection, timeoutSeconds: Double) async -> String {
        let start = Date()
        while Date().timeIntervalSince(start) < timeoutSeconds {
            if pc.iceGatheringState == .complete { break }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return pc.localDescription?.sdp ?? ""
    }

    // MARK: - RTCPeerConnectionDelegate

    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("[STUDENT SFU RECEIVER] Signaling State: \(stateChanged.rawValue)")
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        print("[STUDENT SFU RECEIVER] Stream recibido: \(stream.streamId)")
        if let track = stream.videoTracks.first {
            attachTrack(track)
        }
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams mediaStreams: [RTCMediaStream]) {
        print("[STUDENT SFU RECEIVER] RTP Receiver agregado para tipo: \(rtpReceiver.track?.kind ?? "unknown")")
        if let videoTrack = rtpReceiver.track as? RTCVideoTrack {
            attachTrack(videoTrack)
        }
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        print("[STUDENT SFU RECEIVER] Stream removido: \(stream.streamId)")
    }

    public func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[STUDENT SFU RECEIVER] ICE Connection State: \(newState.rawValue)")
        if newState == .connected || newState == .completed {
            self.isConnected = true
            print("[STUDENT SFU RECEIVER] 🟢 Enlace WebRTC con Mediasoup establecido. Recibiendo paquetes de video...")
        } else if newState == .disconnected || newState == .failed || newState == .closed {
            self.isConnected = false
        }
        self.onConnectionStateChanged?(newState)
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[STUDENT SFU RECEIVER] ICE Gathering State: \(newState.rawValue)")
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("[STUDENT SFU RECEIVER] Candidato ICE generado: \(candidate.sdpMid ?? "0"): \(candidate.sdp)")
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    // MARK: - Teardown

    public func stop() {
        print("[STUDENT SFU RECEIVER] Deteniendo receptor WebRTC...")
        if let track = remoteVideoTrack {
            track.remove(renderer)
            remoteVideoTrack = nil
        }
        peerConnection?.close()
        peerConnection = nil
        isConnected = false
        currentClassroomId = ""
        renderer.reset()
        print("[STUDENT SFU RECEIVER] Recursos de recepción liberados.")
    }
}
