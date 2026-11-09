import Foundation
@preconcurrency import WebRTC

public class GatewayClient: NSObject, URLSessionWebSocketDelegate {
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private let webrtcEngine: WebRtcNativeEngine
    private let gatewayUrl: URL
    private let deviceId: String
    private let macAddress: String
    private let hostname: String
    
    private var pingTimer: Timer?
    private var isConnected: Bool = false
    private var currentSessionId: String = ""
    
    public var onStreamStarted: (() -> Void)?
    public var onStreamStopped: (() -> Void)?
    
    public init(gatewayUrl: URL, deviceId: String, macAddress: String, hostname: String, webrtcEngine: WebRtcNativeEngine) {
        self.gatewayUrl = gatewayUrl
        self.deviceId = deviceId
        self.macAddress = macAddress
        self.hostname = hostname
        self.webrtcEngine = webrtcEngine
        super.init()
        
        self.urlSession = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    }
    
    public func connect() {
        print("[GATEWAY CLIENT] Conectando a AssetSchool AgentGateway en \(gatewayUrl)...")
        let wsTask = urlSession!.webSocketTask(with: gatewayUrl)
        self.webSocketTask = wsTask
        wsTask.resume()
        
        listenForMessages()
    }
    
    public func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
    }
    
    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleSocketIoText(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleSocketIoText(text)
                    }
                @unknown default:
                    break
                }
                self.listenForMessages()
            case .failure(let error):
                print("[GATEWAY CLIENT ERROR] WebSocket error: \(error.localizedDescription)")
                self.isConnected = false
            }
        }
    }
    
    private func handleSocketIoText(_ text: String) {
        // Engine.IO protocol parser
        if text.hasPrefix("0") {
            // Engine.IO handshake received from NestJS Socket.IO
            print("[GATEWAY CLIENT] Handshake Engine.IO recibido. Enviando CONNECT (40)...")
            sendRaw("40")
        } else if text.hasPrefix("40") {
            // Socket.IO connected
            print("[GATEWAY CLIENT] Conectado a Socket.IO. Enviando AGENT_HELLO (agent:hello)...")
            self.isConnected = true
            sendAgentHello()
            startHeartbeat()
        } else if text.hasPrefix("2") {
            // Engine.IO Ping -> Reply with Pong
            sendRaw("3")
        } else if text.hasPrefix("42") {
            // Socket.IO Event
            let jsonString = String(text.dropFirst(2))
            handleSocketIoEvent(jsonString)
        }
    }
    
    private func sendRaw(_ text: String) {
        webSocketTask?.send(.string(text)) { error in
            if let error = error {
                print("[GATEWAY CLIENT ERROR] Error enviando mensaje raw: \(error.localizedDescription)")
            }
        }
    }
    
    private func sendAgentHello() {
        let envelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "AGENT_HELLO",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": deviceId,
            "target": "server",
            "payload": [
                "hostname": hostname,
                "macAddress": macAddress,
                "osType": "macos",
                "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
                "agentVersion": "1.0.0-phase2.3",
                "localIp": "192.168.0.147",
                "enrolledDeviceId": deviceId
            ]
        ]
        
        sendEvent(name: "AGENT_HELLO", payload: envelope)
    }
    
    private func startHeartbeat() {
        DispatchQueue.main.async { [weak self] in
            self?.pingTimer?.invalidate()
            self?.pingTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: true) { [weak self] _ in
                guard let self = self, self.isConnected else { return }
                let pingEnvelope: [String: Any] = [
                    "packetId": UUID().uuidString,
                    "packetType": "HEARTBEAT_PING",
                    "timestamp": Int(Date().timeIntervalSince1970 * 1000),
                    "senderId": self.deviceId,
                    "target": "server",
                    "payload": ["timestamp": Int(Date().timeIntervalSince1970 * 1000)]
                ]
                self.sendEvent(name: "HEARTBEAT_PING", payload: pingEnvelope)
            }
        }
    }
    
    private func sendEvent(name: String, payload: [String: Any]) {
        let eventArray: [Any] = [name, payload]
        if let data = try? JSONSerialization.data(withJSONObject: eventArray),
           let str = String(data: data, encoding: .utf8) {
            sendRaw("42\(str)")
        }
    }
    
    private func handleSocketIoEvent(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
              let eventName = array.first as? String else {
            return
        }
        
        let envelope = array.count > 1 ? array[1] as? [String: Any] : nil
        let payload = envelope?["payload"] as? [String: Any]
        
        switch eventName {
        case "SERVER_HELLO_ACK", "server:hello_ack":
            print("[GATEWAY CLIENT] Handshake confirmado por el servidor (SERVER_HELLO_ACK). Dispositivo listo.")
            
        case "SCREEN_CAPTURE_START", "screen:capture:start":
            print("[GATEWAY CLIENT] Solicitud de supervisión SCREEN_CAPTURE_START recibida desde la consola docente!")
            handleStartCapture(envelope: envelope, payload: payload)
            
        case "WEBRTC_ANSWER", "SIGNAL_SDP_ANSWER", "webrtc:answer":
            print("[GATEWAY CLIENT] Remote SDP Answer recibida desde el Gateway!")
            if let sdp = payload?["sdp"] as? String {
                Task {
                    do {
                        try await webrtcEngine.handleAnswer(sdpAnswer: sdp)
                        print("[GATEWAY CLIENT] Remote SDP Answer aplicada en libwebrtc con éxito.")
                    } catch {
                        print("[GATEWAY CLIENT ERROR] Error aplicando SDP Answer: \(error.localizedDescription)")
                    }
                }
            }
            
        case "WEBRTC_ICE_CANDIDATE", "SIGNAL_ICE_CANDIDATE", "webrtc:ice_candidate":
            if let candObj = payload?["candidate"] as? [String: Any],
               let sdp = candObj["candidate"] as? String {
                let mid = candObj["sdpMid"] as? String
                let mLine = (candObj["sdpMLineIndex"] as? Int32) ?? 0
                webrtcEngine.addRemoteCandidate(sdp: sdp, sdpMid: mid, sdpMLineIndex: mLine)
            }
            
        case "SCREEN_CAPTURE_STOP", "screen:capture:stop":
            print("[GATEWAY CLIENT] Comando SCREEN_CAPTURE_STOP recibido. Deteniendo transmisión...")
            webrtcEngine.close()
            self.currentSessionId = ""
            self.onStreamStopped?()
            
        default:
            break
        }
    }
    
    private func handleStartCapture(envelope: [String: Any]?, payload: [String: Any]?) {
        guard let payload = payload else { return }
        let sessionId = (payload["sessionId"] as? String) ?? "stream_\(UUID().uuidString)"
        let teacherId = (payload["teacherId"] as? String) ?? "teacher"
        let tier = (payload["qualityTier"] as? String) == "individual" ? StreamQualityTier.individual : StreamQualityTier.thumbnail
        let config = tier == .individual ? ScreenCaptureConfiguration.individual : ScreenCaptureConfiguration.thumbnail
        
        self.currentSessionId = sessionId
        
        // Setup local candidate callback to route back to Gateway
        webrtcEngine.onLocalCandidate = { [weak self] sdp, mid, mLineIndex in
            guard let self = self else { return }
            let candEnvelope: [String: Any] = [
                "packetId": UUID().uuidString,
                "packetType": "WEBRTC_ICE_CANDIDATE",
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
                "senderId": self.deviceId,
                "target": "server",
                "payload": [
                    "sessionId": sessionId,
                    "senderId": self.deviceId,
                    "targetId": teacherId,
                    "candidate": [
                        "candidate": sdp,
                        "sdpMid": mid,
                        "sdpMLineIndex": mLineIndex
                    ]
                ]
            ]
            self.sendEvent(name: "WEBRTC_ICE_CANDIDATE", payload: candEnvelope)
        }
        
        Task {
            do {
                let sdpOffer = try await webrtcEngine.createOffer(sessionId: sessionId, config: config)
                print("[GATEWAY CLIENT] SDP Offer generada por libwebrtc. Enviando WEBRTC_OFFER al Gateway...")
                
                let offerEnvelope: [String: Any] = [
                    "packetId": UUID().uuidString,
                    "packetType": "WEBRTC_OFFER",
                    "timestamp": Int(Date().timeIntervalSince1970 * 1000),
                    "senderId": self.deviceId,
                    "target": "server",
                    "payload": [
                        "sessionId": sessionId,
                        "targetDeviceId": self.deviceId,
                        "targetTeacherId": teacherId,
                        "sdp": sdpOffer
                    ]
                ]
                self.sendEvent(name: "WEBRTC_OFFER", payload: offerEnvelope)
                self.onStreamStarted?()
            } catch {
                print("[GATEWAY CLIENT ERROR] Error al crear oferta WebRTC: \(error.localizedDescription)")
            }
        }
    }
}
