import Foundation
@preconcurrency import WebRTC

public class GatewayClient: NSObject, URLSessionWebSocketDelegate {
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private let webrtcEngine: WebRtcNativeEngine
    public let broadcastReceiverEngine = TeacherBroadcastReceiverEngine()
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
        ThumbnailCaptureService.shared.stop()
        LockCurtainManager.shared.onGatewayDisconnected()
        CaptureIndicatorWindow.shared.hide()
        broadcastReceiverEngine.stop()
        TeacherBroadcastManager.shared.stopBroadcast()
        RemoteInputService.shared.endRemoteControl()
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
                ThumbnailCaptureService.shared.stop()
                LockCurtainManager.shared.onGatewayDisconnected()
                CaptureIndicatorWindow.shared.hide()
                TeacherBroadcastManager.shared.stopBroadcast()
                RemoteInputService.shared.endRemoteControl()
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
        let payload = (envelope?["payload"] as? [String: Any]) ?? envelope
        
        switch eventName {
        case "SERVER_HELLO_ACK", "server:hello_ack":
            print("[GATEWAY CLIENT] Handshake confirmado por el servidor (SERVER_HELLO_ACK). Dispositivo listo.")
            LockCurtainManager.shared.onGatewayReconnected()
            // Iniciar captura periódica de miniaturas ScreenCaptureKit para la consola docente
            ThumbnailCaptureService.shared.onThumbnailGenerated = { [weak self] b64 in
                guard let self = self, self.isConnected else { return }
                self.sendEvent(name: "DEVICE_THUMBNAIL", payload: [
                    "deviceId": self.deviceId,
                    "thumbnailBase64": b64,
                    "timestamp": Int(Date().timeIntervalSince1970 * 1000)
                ])
            }
            ThumbnailCaptureService.shared.start(intervalSeconds: 3.0)
            
        case "SCREEN_CAPTURE_START", "screen:capture:start":
            print("[GATEWAY CLIENT] Solicitud de supervisión SCREEN_CAPTURE_START recibida desde la consola docente!")
            CaptureIndicatorWindow.shared.showSupervision(teacherName: "el Docente")
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
            CaptureIndicatorWindow.shared.hide()
            self.currentSessionId = ""
            self.onStreamStopped?()

        case "COMMAND_DISPATCH", "command:dispatch":
            handleCommandDispatch(envelope: envelope, payload: payload)

        // -------------------------------------------------------------
        // FILE TRANSFER & WORK COLLECTION
        // -------------------------------------------------------------
        case "FILE_LIST_DIR":
            handleFileListDir(payload: payload)

        case "FILE_SEND":
            handleFileSend(payload: payload)

        case "FILE_COLLECT":
            handleFileCollect(payload: payload)

        // -------------------------------------------------------------
        // PROCESS & APPLICATION CONTROL
        // -------------------------------------------------------------
        case "PROCESS_LIST_REQUEST":
            handleProcessListRequest(payload: payload)

        case "KILL_PROCESS":
            handleKillProcess(payload: payload)

        // -------------------------------------------------------------
        // INTERACTIVE REMOTE CONTROL
        // -------------------------------------------------------------
        case "REMOTE_INPUT_EVENT":
            handleRemoteInputEvent(payload: payload)

        // -------------------------------------------------------------
        // VEYON MODULES: LOCK, MESSAGE, POWER & BROADCAST
        // -------------------------------------------------------------
        case "LOCK_SCREEN", "TEACHER_LOCK_CLASSROOM", "TEACHER_LOCK_DEVICE":
            let msg = payload?["message"] as? String ?? "Atención al frente. Pausa pedagógica activa."
            let teacher = payload?["teacherName"] as? String ?? "el Profesor"
            print("[GATEWAY CLIENT] 🔒 Bloqueo pedagógico recibido: \(msg)")
            LockCurtainManager.shared.show(message: msg, teacherName: teacher)

        case "UNLOCK_SCREEN", "TEACHER_UNLOCK_CLASSROOM", "TEACHER_UNLOCK_DEVICE":
            print("[GATEWAY CLIENT] 🟢 Desbloqueo de estación recibido.")
            LockCurtainManager.shared.hide()

        case "POPUP_MESSAGE":
            handlePopupMessage(payload: payload)

        case "POWER_ACTION":
            handlePowerAction(payload: payload)

        case "TEACHER_BROADCAST_START":
            let teacher = payload?["teacherName"] as? String ?? "el Profesor"
            let mode = payload?["mode"] as? String ?? "fullscreen"
            let classroomId = payload?["classroomId"] as? String ?? "default"
            let sfuProducerId = payload?["sfuProducerId"] as? String
            print("[GATEWAY CLIENT] 📡 Transmisión de pantalla docente iniciada por \(teacher) (Modo: \(mode), SFU Producer: \(sfuProducerId ?? "N/A"))")
            TeacherBroadcastManager.shared.startBroadcast(teacherName: teacher, mode: mode)
            CaptureIndicatorWindow.shared.showSupervision(teacherName: teacher)
            if sfuProducerId != nil {
                Task {
                    await self.subscribeToSfuBroadcast(classroomId: classroomId)
                }
            }

        case "STUDENT_BROADCAST_SUBSCRIBED":
            let consumerId = payload?["consumerId"] as? String ?? ""
            print("[GATEWAY CLIENT SFU] ✅ Suscripción SFU confirmada por el servidor (Consumer ID: \(consumerId)).")
            if let sdpAnswer = payload?["sdpAnswer"] as? String {
                Task {
                    do {
                        try await self.broadcastReceiverEngine.handleRemoteAnswer(sdpAnswer: sdpAnswer)
                        print("[GATEWAY CLIENT SFU] 🎥 Remote SDP Answer aplicada con éxito en receptor WebRTC.")
                    } catch {
                        print("[GATEWAY CLIENT SFU ERROR] Error aplicando sdpAnswer en receptor: \(error.localizedDescription)")
                    }
                }
            }

        case "TEACHER_BROADCAST_STOP":
            print("[GATEWAY CLIENT] 📡 Transmisión de pantalla docente finalizada.")
            self.broadcastReceiverEngine.stop()
            TeacherBroadcastManager.shared.stopBroadcast()
            CaptureIndicatorWindow.shared.hide()
            
        default:
            break
        }
    }
    
    private func subscribeToSfuBroadcast(classroomId: String) async {
        print("[GATEWAY CLIENT SFU] 📡 Negociando suscripción WebRTC nativa para pantalla docente en aula \(classroomId)...")
        do {
            let sdpOffer = try await broadcastReceiverEngine.prepareSubscription(classroomId: classroomId)
            print("[GATEWAY CLIENT SFU] 📡 Oferta SDP generada con éxito (\(sdpOffer.count) bytes). Enviando STUDENT_BROADCAST_SUBSCRIBE...")
            sendEvent(name: "STUDENT_BROADCAST_SUBSCRIBE", payload: [
                "classroomId": classroomId,
                "sdpOffer": sdpOffer
            ])
        } catch {
            print("[GATEWAY CLIENT SFU ERROR] Error generando oferta WebRTC de alumno: \(error.localizedDescription)")
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
                // R0 / S5: report the failure (e.g. missing screen recording
                // permission) instead of silently streaming synthetic frames.
                let isPermission = (error as? WebRtcNativeEngine.ScreenCaptureError) == .permissionDenied
                let errorEnvelope: [String: Any] = [
                    "packetId": UUID().uuidString,
                    "packetType": "WEBRTC_ERROR",
                    "timestamp": Int(Date().timeIntervalSince1970 * 1000),
                    "senderId": self.deviceId,
                    "target": "server",
                    "payload": [
                        "sessionId": sessionId,
                        "deviceId": self.deviceId,
                        "code": isPermission ? "PERMISSION_DENIED" : "PEER_CONNECTION_FAILED",
                        "message": error.localizedDescription
                    ]
                ]
                self.sendEvent(name: "WEBRTC_ERROR", payload: errorEnvelope)
            }
        }
    }
    
    private func handleCommandDispatch(envelope: [String: Any]?, payload: [String: Any]?) {
        guard let payload = payload else { return }
        let commandId = (payload["commandId"] as? String) ?? UUID().uuidString
        let commandType = (payload["commandType"] as? String) ?? ""
        let params = payload["params"] as? [String: Any]
        
        print("[GATEWAY CLIENT] Comando recibido: \(commandType) (ID: \(commandId))")
        
        switch commandType {
        case "LOCK_SCREEN":
            let message = params?["message"] as? String
            let teacherName = (params?["teacherName"] as? String) ?? "Mariana Fuentes"
            let institutionName = (params?["institutionName"] as? String) ?? "Instituto Politécnico Central"
            let classroomName = params?["classroomName"] as? String
            
            LockCurtainManager.shared.show(
                message: message,
                teacherName: teacherName,
                institutionName: institutionName,
                classroomName: classroomName
            )
            sendCommandResult(commandId: commandId, success: true)
            
        case "UNLOCK_SCREEN":
            LockCurtainManager.shared.hide()
            sendCommandResult(commandId: commandId, success: true)

        case "KILL_PROCESS":
            let pidVal = params?["pid"] as? Int
            let nameVal = params?["name"] as? String
            let bundleVal = params?["bundleId"] as? String
            let pid = pidVal != nil ? pid_t(pidVal!) : nil
            let res = ProcessManagerService.shared.terminateApplication(pid: pid, bundleId: bundleVal, name: nameVal)
            sendCommandResult(commandId: commandId, success: res.success, error: res.error)

        case "TRANSFER_FILE":
            guard let fileName = params?["fileName"] as? String,
                  let content = params?["fileContentBase64"] as? String else {
                sendCommandResult(commandId: commandId, success: false, error: "Parámetros incompletos para TRANSFER_FILE")
                return
            }
            let targetDir = params?["targetDir"] as? String
            let res = FileManagerService.shared.saveIncomingFile(fileName: fileName, base64Content: content, targetDir: targetDir)
            sendCommandResult(commandId: commandId, success: res.success, error: res.error)

        case "COLLECT_FILE":
            guard let filePath = params?["filePath"] as? String else {
                sendCommandResult(commandId: commandId, success: false, error: "Ruta de archivo no especificada")
                return
            }
            let res = FileManagerService.shared.readFileToCollect(path: filePath)
            sendCommandResult(commandId: commandId, success: res.success, error: res.error)
            
        default:
            print("[GATEWAY CLIENT AVISO] Tipo de comando no manejado por este agente: \(commandType)")
            sendCommandResult(commandId: commandId, success: false, error: "Comando no soportado")
        }
    }

    // MARK: - File Transfer Handlers
    private func handleFileListDir(payload: [String: Any]?) {
        guard let payload = payload else { return }
        let requestId = (payload["requestId"] as? String) ?? UUID().uuidString
        let dirPath = payload["dirPath"] as? String

        let result = FileManagerService.shared.listDirectory(path: dirPath)
        var responsePayload: [String: Any] = [
            "requestId": requestId,
            "deviceId": self.deviceId,
            "currentPath": result.currentPath,
            "items": result.items
        ]
        if let parent = result.parentPath {
            responsePayload["parentPath"] = parent
        }
        if let err = result.error {
            responsePayload["error"] = err
        }

        let envelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "FILE_LIST_DIR_RESULT",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": self.deviceId,
            "target": "server",
            "payload": responsePayload
        ]
        sendEvent(name: "FILE_LIST_DIR_RESULT", payload: envelope)
    }

    private func handleFileSend(payload: [String: Any]?) {
        guard let payload = payload else { return }
        let transferId = (payload["transferId"] as? String) ?? UUID().uuidString
        let fileName = (payload["fileName"] as? String) ?? "archivo_recibido.dat"
        let base64Content = (payload["fileContentBase64"] as? String) ?? ""
        let targetDir = payload["targetDir"] as? String
        let expectedSha256 = payload["sha256"] as? String
        let chunkIndex = payload["chunkIndex"] as? Int
        let totalChunks = payload["totalChunks"] as? Int

        let result: (success: Bool, savedPath: String?, sha256: String?, error: String?)
        if let idx = chunkIndex, let total = totalChunks, total > 1 {
            let chunkRes = FileManagerService.shared.saveFileChunk(
                transferId: transferId,
                fileName: fileName,
                chunkIndex: idx,
                totalChunks: total,
                base64Chunk: base64Content,
                expectedSha256: expectedSha256,
                targetDir: targetDir
            )
            result = (chunkRes.completed, chunkRes.savedPath, chunkRes.sha256, chunkRes.error)
        } else {
            result = FileManagerService.shared.saveIncomingFile(
                fileName: fileName,
                base64Content: base64Content,
                targetDir: targetDir,
                expectedSha256: expectedSha256
            )
        }

        var responsePayload: [String: Any] = [
            "transferId": transferId,
            "deviceId": self.deviceId,
            "success": result.success
        ]
        if let path = result.savedPath {
            responsePayload["savedPath"] = path
        }
        if let hash = result.sha256 {
            responsePayload["sha256"] = hash
        }
        if let err = result.error {
            responsePayload["error"] = err
        }

        let envelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "FILE_SEND_RESULT",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": self.deviceId,
            "target": "server",
            "payload": responsePayload
        ]
        sendEvent(name: "FILE_SEND_RESULT", payload: envelope)
    }

    private func handleFileCollect(payload: [String: Any]?) {
        guard let payload = payload else { return }
        let collectId = (payload["collectId"] as? String) ?? UUID().uuidString
        let filePath = (payload["filePath"] as? String) ?? ""

        let result = FileManagerService.shared.readFileToCollect(path: filePath)

        var responsePayload: [String: Any] = [
            "collectId": collectId,
            "deviceId": self.deviceId,
            "fileName": result.fileName,
            "fileSizeBytes": result.size,
            "success": result.success
        ]
        if let hash = result.sha256 {
            responsePayload["sha256"] = hash
        }
        if let content = result.base64Content {
            responsePayload["fileContentBase64"] = content
        }
        if let err = result.error {
            responsePayload["error"] = err
        }

        let envelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "FILE_COLLECT_RESULT",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": self.deviceId,
            "target": "server",
            "payload": responsePayload
        ]
        sendEvent(name: "FILE_COLLECT_RESULT", payload: envelope)
    }

    // MARK: - Process Management Handlers
    private func handleProcessListRequest(payload: [String: Any]?) {
        let processes = ProcessManagerService.shared.getRunningApplications()

        let envelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "PROCESS_LIST_RESULT",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": self.deviceId,
            "target": "server",
            "payload": [
                "deviceId": self.deviceId,
                "processes": processes
            ]
        ]
        sendEvent(name: "PROCESS_LIST_RESULT", payload: envelope)
    }

    private func handleKillProcess(payload: [String: Any]?) {
        guard let payload = payload else { return }
        let pidVal = payload["pid"] as? Int
        let bundleId = payload["bundleId"] as? String
        let processName = payload["processName"] as? String
        let pid = pidVal != nil ? pid_t(pidVal!) : nil

        let result = ProcessManagerService.shared.terminateApplication(pid: pid, bundleId: bundleId, name: processName)

        var responsePayload: [String: Any] = [
            "deviceId": self.deviceId,
            "success": result.success
        ]
        if let p = pid { responsePayload["pid"] = Int(p) }
        if let n = processName { responsePayload["processName"] = n }
        if let err = result.error { responsePayload["error"] = err }

        let envelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "KILL_PROCESS_RESULT",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": self.deviceId,
            "target": "server",
            "payload": responsePayload
        ]
        sendEvent(name: "KILL_PROCESS_RESULT", payload: envelope)
    }

    // MARK: - Interactive Remote Input Handler
    private func handleRemoteInputEvent(payload: [String: Any]?) {
        guard let p = payload else { return }
        let dict = (p["input"] as? [String: Any]) ?? p
        let type = (dict["type"] as? String) ?? "mouseMove"
        let x = dict["x"] as? Double
        let y = dict["y"] as? Double
        let button = dict["button"] as? String
        let keyCodeVal = dict["keyCode"] as? Int
        let keyCode = keyCodeVal != nil ? UInt16(keyCodeVal!) : nil
        let keyText = dict["keyText"] as? String

        RemoteInputService.shared.handleRemoteInput(
            type: type,
            x: x,
            y: y,
            button: button,
            keyCode: keyCode,
            keyText: keyText
        )
    }

    private func handlePopupMessage(payload: [String: Any]?) {
        guard let p = payload else { return }
        let title = (p["title"] as? String) ?? "Aviso del Profesor"
        let message = (p["message"] as? String) ?? ""
        let sender = (p["teacherName"] as? String) ?? "Profesor"
        let messageId = (p["messageId"] as? String) ?? UUID().uuidString

        print("[GATEWAY CLIENT] 📢 Mensaje emergente recibido de \(sender): \"\(message)\"")

        DispatchQueue.main.async { [weak self] in
            let alert = NSAlert()
            alert.messageText = "📢 \(title)"
            alert.informativeText = "\(message)\n\n— Enviado por: \(sender)"
            alert.alertStyle = .informational
            alert.addButton(withTitle: "Entendido")
            alert.window.level = .floating
            alert.runModal()

            guard let self = self, self.isConnected else { return }
            self.sendEvent(name: "MESSAGE_ACK", payload: [
                "messageId": messageId,
                "deviceId": self.deviceId,
                "hostname": self.hostname,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000)
            ])
        }
    }

    private func handlePowerAction(payload: [String: Any]?) {
        guard let p = payload, let op = p["operation"] as? String else { return }
        let actionId = (p["actionId"] as? String) ?? UUID().uuidString
        let delay = (p["delaySeconds"] as? Int) ?? 5

        print("[GATEWAY CLIENT] ⚡ Acción de energía recibida: \(op) (retardo: \(delay)s)")

        let script: String
        switch op.lowercased() {
        case "reboot":
            script = "tell application \"System Events\" to restart"
        case "shutdown":
            script = "tell application \"System Events\" to shut down"
        case "logout":
            script = "tell application \"System Events\" to log out"
        default:
            script = ""
        }

        if !script.isEmpty {
            DispatchQueue.global().asyncAfter(deadline: .now() + .seconds(delay)) {
                let proc = Process()
                proc.launchPath = "/usr/bin/osascript"
                proc.arguments = ["-e", script]
                try? proc.run()
            }
        }

        sendEvent(name: "POWER_ACTION_RESULT", payload: [
            "actionId": actionId,
            "operation": op,
            "success": true
        ])
    }
    
    private func sendCommandResult(commandId: String, success: Bool, error: String? = nil) {
        var resPayload: [String: Any] = [
            "commandId": commandId,
            "completedAt": Int(Date().timeIntervalSince1970 * 1000),
            "success": success
        ]
        if let err = error {
            resPayload["error"] = err
        }
        
        let resultEnvelope: [String: Any] = [
            "packetId": UUID().uuidString,
            "packetType": "COMMAND_RESULT",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "senderId": self.deviceId,
            "target": "server",
            "payload": resPayload
        ]
        
        sendEvent(name: "COMMAND_RESULT", payload: resultEnvelope)
    }
}
