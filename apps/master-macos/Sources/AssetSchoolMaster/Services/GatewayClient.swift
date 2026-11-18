import Foundation
import Combine
import AppKit
import CryptoKit

public class MasterGatewayClient: ObservableObject {
    public static let shared = MasterGatewayClient()

    @Published public var isConnected: Bool = false
    @Published public var serverHost: String = "127.0.0.1"
    @Published public var serverPort: Int = 3000
    @Published public var devices: [StudentDevice] = []
    @Published public var statusMessage: String = "Desconectado"
    @Published public var isBroadcastingScreen: Bool = false
    @Published public var lastLog: String = ""

    // Classroom state
    @Published public var activeClassroom: ClassroomInfo = ClassroomInfo(
        id: "d1111111-1111-1111-1111-111111111111",
        name: "Laboratorio 1",
        description: "Aula Informática Principal"
    )
    @Published public var availableClassrooms: [ClassroomInfo] = [
        ClassroomInfo(id: "d1111111-1111-1111-1111-111111111111", name: "Laboratorio 1", description: "Aula Informática Principal"),
        ClassroomInfo(id: "d2222222-2222-2222-2222-222222222222", name: "Laboratorio 2", description: "Laboratorio de Ciencias"),
        ClassroomInfo(id: "a63e092c-1a03-40ee-861d-55bd9564c3c2", name: "Laboratorio Alfa", description: "Sala de Computación B")
    ]

    // File transfer state
    @Published public var activeTransfer: FileTransferSession?
    @Published public var lastCollectedFile: (name: String, path: String, date: Date)?
    public var onRemoteDirListed: (([RemoteFileItem]) -> Void)?

    // Messaging state
    @Published public var lastMessageAck: (deviceId: String, hostname: String, time: Date)?

    // Broadcast engine
    public let broadcastEngine = TeacherBroadcastEngine()

    private var webSocketTask: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var heartbeatCheckTimer: Timer?
    private var token: String?
    private let session = URLSession(configuration: .default)

    public init() {
        startHeartbeatChecker()
    }

    deinit {
        heartbeatCheckTimer?.invalidate()
        pingTimer?.invalidate()
    }

    public func connect(host: String = "127.0.0.1", port: Int = 3000, jwtToken: String? = nil) {
        self.serverHost = host
        self.serverPort = port

        if let token = jwtToken {
            self.token = token
            self.initiateWebSocketConnection(host: host, port: port, token: token)
        } else {
            loginAndConnect(host: host, port: port)
        }
    }

    private func loginAndConnect(host: String, port: Int) {
        guard let loginUrl = URL(string: "http://\(host):\(port)/api/v1/auth/login") else { return }
        var req = URLRequest(url: loginUrl)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["email": "admin@assetschool.lan", "password": "Admin123!*"]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        statusMessage = "Autenticando credenciales docentes..."
        session.dataTask(with: req) { [weak self] data, response, error in
            guard let self = self else { return }
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let token = json["accessToken"] as? String {
                self.token = token
                DispatchQueue.main.async {
                    self.log("Docente autenticado exitosamente mediante JWT")
                }
                self.initiateWebSocketConnection(host: host, port: port, token: token)
            } else {
                DispatchQueue.main.async {
                    self.statusMessage = "Fallo de autenticación con el servidor"
                    self.log("No se pudo iniciar sesión en \(loginUrl)")
                }
                self.initiateWebSocketConnection(host: host, port: port, token: nil)
            }
        }.resume()
    }

    private func initiateWebSocketConnection(host: String, port: Int, token: String?) {
        guard let url = URL(string: "ws://\(host):\(port)/socket.io/?EIO=4&transport=websocket") else {
            statusMessage = "URL inválida"
            return
        }

        disconnect()
        statusMessage = "Conectando al servidor central..."
        log("Conectando a \(url.absoluteString)")

        var request = URLRequest(url: url)
        if let token = token {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        webSocketTask = session.webSocketTask(with: request)
        webSocketTask?.resume()

        listenForMessages()
        startPingTimer()
    }

    public func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        statusMessage = "Desconectado"
    }

    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .failure(let error):
                DispatchQueue.main.async {
                    self.isConnected = false
                    self.statusMessage = "Error de conexión: \(error.localizedDescription)"
                    self.log("WebSocket error: \(error.localizedDescription)")
                }
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleIncomingMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleIncomingMessage(text)
                    }
                @unknown default:
                    break
                }
                self.listenForMessages()
            }
        }
    }

    private func handleIncomingMessage(_ raw: String) {
        if raw == "2" {
            // Engine.IO Ping -> respond Pong "3"
            webSocketTask?.send(.string("3")) { _ in }
            return
        }

        if raw.starts(with: "0") {
            // Engine.IO open handshake
            DispatchQueue.main.async {
                self.isConnected = true
                self.statusMessage = "Conectado al servidor central"
                self.log("Handshake Engine.IO completado con éxito")
            }
            // Send Socket.IO connect
            webSocketTask?.send(.string("40")) { _ in }
            return
        }

        if raw.starts(with: "40") {
            // Socket.IO connected -> Join Classroom
            joinClassroom()
            return
        }

        if raw.starts(with: "42") {
            // Socket.IO Event
            let jsonString = String(raw.dropFirst(2))
            parseSocketIoEvent(jsonString)
        }
    }

    private func parseSocketIoEvent(_ jsonText: String) {
        guard let data = jsonText.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
              let eventName = array.first as? String else { return }

        DispatchQueue.main.async {
            self.log("Evento recibido: \(eventName)")
            let payload = array.count > 1 ? array[1] as? [String: Any] : nil

            switch eventName {
            case "DEVICE_LIST", "CLASSROOM_SNAPSHOT":
                if array.count > 1, let listPayload = array[1] as? [[String: Any]] {
                    self.updateDeviceList(listPayload)
                }

            case "DEVICE_STATUS_CHANGE", "DEVICE_STATUS_CHANGED":
                if let p = payload {
                    self.updateSingleDevice(p)
                }

            case "LOCK_STATUS_CHANGE":
                if let p = payload,
                   let deviceId = p["deviceId"] as? String,
                   let locked = p["locked"] as? Bool {
                    if let dev = self.devices.first(where: { $0.id == deviceId }) {
                        dev.isLocked = locked
                        dev.status = locked ? .locked : .online
                        dev.lastHeartbeat = Date()
                    }
                }

            case "DEVICE_THUMBNAIL":
                if let p = payload,
                   let deviceId = p["deviceId"] as? String,
                   let b64 = p["thumbnailBase64"] as? String,
                   let data = Data(base64Encoded: b64),
                   let image = NSImage(data: data) {
                    if let dev = self.devices.first(where: { $0.id == deviceId }) {
                        dev.thumbnail = image
                        dev.lastHeartbeat = Date()
                        dev.status = dev.isLocked ? .locked : .online
                    }
                }

            case "MESSAGE_ACK":
                if let p = payload,
                   let deviceId = p["deviceId"] as? String,
                   let hostname = p["hostname"] as? String {
                    self.lastMessageAck = (deviceId: deviceId, hostname: hostname, time: Date())
                    self.log("[MENSAJE CONFIRMADO] El alumno en \(hostname) confirmó lectura del aviso.")
                }

            case "FILE_SEND_RESULT":
                if let p = payload {
                    let success = p["success"] as? Bool ?? false
                    let transferId = p["transferId"] as? String ?? ""
                    let err = p["error"] as? String
                    if let active = self.activeTransfer, active.id == transferId {
                        active.status = success ? .completed : .failed
                        active.progress = success ? 1.0 : active.progress
                        active.errorMessage = err
                    }
                    self.log("[ARCHIVO] Resultado de distribución: \(success ? "ÉXITO" : "FALLO: \(err ?? "desconocido")")")
                }

            case "FILE_COLLECT_RESULT":
                if let p = payload {
                    let success = p["success"] as? Bool ?? false
                    let fileName = p["fileName"] as? String ?? "trabajo_recolectado.dat"
                    let b64 = p["fileContentBase64"] as? String ?? ""
                    let sha = p["sha256"] as? String ?? ""
                    let err = p["error"] as? String

                    if success, let data = Data(base64Encoded: b64) {
                        self.saveCollectedFileData(data: data, fileName: fileName, sha256: sha)
                    } else {
                        self.log("[ARCHIVO ERROR] No se pudo recolectar archivo: \(err ?? "error desconocido")")
                    }
                }

            case "FILE_LIST_DIR_RESULT":
                if let p = payload, let rawItems = p["items"] as? [[String: Any]] {
                    var items: [RemoteFileItem] = []
                    for raw in rawItems {
                        let name = raw["name"] as? String ?? "archivo"
                        let path = raw["path"] as? String ?? ""
                        let size = raw["size"] as? Int ?? 0
                        let isDir = raw["isDirectory"] as? Bool ?? false
                        let ext = raw["extension"] as? String ?? ""
                        let modifiedEpoch = raw["modifiedAt"] as? Double ?? 0
                        let modDate = modifiedEpoch > 0 ? Date(timeIntervalSince1970: modifiedEpoch / 1000.0) : Date()
                        items.append(RemoteFileItem(name: name, path: path, size: size, isDirectory: isDir, modifiedAt: modDate, fileExtension: ext))
                    }
                    self.onRemoteDirListed?(items)
                }

            case "TEACHER_BROADCAST_STARTED":
                if let p = payload {
                    let targetCount = p["targetCount"] as? Int ?? 0
                    let producerId = p["producerId"] as? String ?? ""
                    let sdpAnswer = p["sdpAnswer"] as? String
                    self.log("[SFU BROADCAST] ✅ Transmisión docente iniciada hacia \(targetCount) estudiantes (Producer ID: \(producerId))")
                    if let answer = sdpAnswer, !answer.isEmpty {
                        Task {
                            do {
                                try await self.broadcastEngine.handleRemoteAnswer(sdpAnswer: answer)
                                await MainActor.run {
                                    self.log("[SFU BROADCAST] Enlace WebRTC con Mediasoup establecido. Emitiendo video H.264 real.")
                                }
                            } catch {
                                await MainActor.run {
                                    self.log("[SFU BROADCAST ERROR] Error al aplicar SDP Answer: \(error.localizedDescription)")
                                }
                            }
                        }
                    }
                }

            case "TEACHER_BROADCAST_STOPPED":
                self.isBroadcastingScreen = false
                self.broadcastEngine.stop()
                self.log("[SFU BROADCAST] 🛑 Transmisión docente finalizada.")

            default:
                break
            }
        }
    }

    private func updateDeviceList(_ items: [[String: Any]]) {
        var updated: [StudentDevice] = []
        for item in items {
            let id = item["id"] as? String ?? item["deviceId"] as? String ?? UUID().uuidString
            let hostname = item["hostname"] as? String ?? "Host-\(id.prefix(4))"
            let os = MasterDevicePlatform(rawValue: (item["osType"] as? String ?? "").lowercased()) ?? .unknown
            let ip = item["localIp"] as? String ?? item["ip"] as? String ?? "127.0.0.1"
            let isLocked = (item["status"] as? String == "locked") || (item["isLocked"] as? Bool ?? false)
            let status: MasterDeviceStatus = isLocked ? .locked : .online
            let mac = item["macAddress"] as? String ?? ""
            let agentVer = item["agentVersion"] as? String ?? "1.0.0"

            if let existing = self.devices.first(where: { $0.id == id }) {
                existing.hostname = hostname
                existing.osType = os
                existing.localIp = ip
                existing.macAddress = mac.isEmpty ? existing.macAddress : mac
                existing.agentVersion = agentVer
                existing.status = status
                existing.isLocked = isLocked
                existing.currentStudentName = item["currentStudentName"] as? String ?? existing.currentStudentName
                existing.classroomName = activeClassroom.name
                existing.lastHeartbeat = Date()
                updated.append(existing)
            } else {
                let dev = StudentDevice(id: id, hostname: hostname, osType: os, localIp: ip, macAddress: mac, agentVersion: agentVer, status: status)
                dev.isLocked = isLocked
                dev.currentStudentName = item["currentStudentName"] as? String
                dev.classroomName = activeClassroom.name
                dev.lastHeartbeat = Date()
                updated.append(dev)
            }
        }
        self.devices = updated
    }

    private func updateSingleDevice(_ payload: [String: Any]) {
        guard let id = payload["deviceId"] as? String ?? payload["id"] as? String else { return }
        if let existing = devices.first(where: { $0.id == id }) {
            if let hostname = payload["hostname"] as? String { existing.hostname = hostname }
            if let ip = payload["localIp"] as? String { existing.localIp = ip }
            if let st = payload["status"] as? String, let status = MasterDeviceStatus(rawValue: st) {
                existing.status = status
                existing.isLocked = (status == .locked)
            }
            existing.lastHeartbeat = Date()
        } else {
            let hostname = payload["hostname"] as? String ?? "Host-\(id.prefix(4))"
            let dev = StudentDevice(id: id, hostname: hostname)
            dev.classroomName = activeClassroom.name
            dev.lastHeartbeat = Date()
            devices.append(dev)
        }
    }

    private func startHeartbeatChecker() {
        heartbeatCheckTimer?.invalidate()
        heartbeatCheckTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            DispatchQueue.main.async {
                self?.objectWillChange.send()
            }
        }
    }

    // ==========================================
    // CLASSROOM SELECTION
    // ==========================================

    public func switchClassroom(to classroom: ClassroomInfo) {
        log("[AULA] Cambiando a \(classroom.name) (\(classroom.id))...")
        self.activeClassroom = classroom
        self.devices.removeAll()
        joinClassroom()
    }

    private func joinClassroom() {
        var payload: [String: Any] = ["classroomId": activeClassroom.id]
        if let t = token {
            payload["token"] = t
        }
        let event = ["TEACHER_JOIN_CLASSROOM", payload] as [Any]
        emitEvent(event)
    }

    // ==========================================
    // MULTI-SELECTION & BULK ACTIONS
    // ==========================================

    public var selectedDevices: [StudentDevice] {
        devices.filter { $0.isSelected }
    }

    public func selectAll() {
        for dev in devices { dev.isSelected = true }
        objectWillChange.send()
    }

    public func deselectAll() {
        for dev in devices { dev.isSelected = false }
        objectWillChange.send()
    }

    public func lockSelected(message: String = "Pausa pedagógica activa para los equipos seleccionados.") {
        let targets = selectedDevices.isEmpty ? devices : selectedDevices
        log("[COMANDO] Bloqueando \(targets.count) equipo(s)")
        for dev in targets {
            lockDevice(id: dev.id, message: message)
        }
    }

    public func unlockSelected() {
        let targets = selectedDevices.isEmpty ? devices : selectedDevices
        log("[COMANDO] Desbloqueando \(targets.count) equipo(s)")
        for dev in targets {
            unlockDevice(id: dev.id)
        }
    }

    public func lockAll(message: String = "Atención al frente. Pausa pedagógica activa.") {
        log("[COMANDO] Bloquear toda el aula")
        emitEvent(["TEACHER_LOCK_CLASSROOM", ["message": message, "classroomId": activeClassroom.id]])
        for dev in devices {
            dev.isLocked = true
            dev.status = .locked
        }
    }

    public func unlockAll() {
        log("[COMANDO] Desbloquear toda el aula")
        emitEvent(["TEACHER_UNLOCK_CLASSROOM", ["classroomId": activeClassroom.id]])
        for dev in devices {
            dev.isLocked = false
            dev.status = .online
        }
    }

    public func lockDevice(id: String, message: String = "Pantalla bloqueada por el profesor") {
        log("[COMANDO] Bloquear equipo \(id)")
        emitEvent(["TEACHER_LOCK_DEVICE", ["deviceId": id, "message": message]])
        if let dev = devices.first(where: { $0.id == id }) {
            dev.isLocked = true
            dev.status = .locked
        }
    }

    public func unlockDevice(id: String) {
        log("[COMANDO] Desbloquear equipo \(id)")
        emitEvent(["TEACHER_UNLOCK_DEVICE", ["deviceId": id]])
        if let dev = devices.first(where: { $0.id == id }) {
            dev.isLocked = false
            dev.status = .online
        }
    }

    // ==========================================
    // POPUP TEXT MESSAGING
    // ==========================================

    public func sendPopupMessage(title: String, message: String, targetDeviceId: String? = nil, priority: String = "normal") {
        log("[MENSAJE] Enviando '\(title)' a \(targetDeviceId ?? "toda el aula")")
        var payload: [String: Any] = [
            "title": title,
            "message": message,
            "priority": priority,
            "classroomId": activeClassroom.id
        ]
        if let target = targetDeviceId {
            payload["targetDeviceId"] = target
        }
        emitEvent(["TEACHER_SEND_POPUP_MESSAGE", payload])
    }

    // ==========================================
    // FILE TRANSFER & WORK COLLECTION
    // ==========================================

    public func sendFile(fileUrl: URL, toDeviceId: String? = nil, isBroadcast: Bool = false) {
        do {
            let fileData = try Data(contentsOf: fileUrl)
            let fileName = fileUrl.lastPathComponent
            let hash = SHA256.hash(data: fileData).map { String(format: "%02x", $0) }.joined()
            let base64 = fileData.base64EncodedString()

            let targetDesc = isBroadcast ? "Toda el aula (\(devices.count) alumnos)" : (devices.first(where: { $0.id == toDeviceId })?.hostname ?? "Equipo")
            let session = FileTransferSession(fileName: fileName, totalBytes: fileData.count, targetSummary: targetDesc, isBroadcast: isBroadcast)
            session.sha256 = hash
            session.status = .transferring
            self.activeTransfer = session

            log("[ARCHIVO] Enviando \(fileName) (\(fileData.count) bytes, SHA-256: \(hash.prefix(8))...) a \(targetDesc)")

            var payload: [String: Any] = [
                "fileName": fileName,
                "fileSizeBytes": fileData.count,
                "fileContentBase64": base64,
                "sha256": hash,
                "classroomId": activeClassroom.id
            ]

            if isBroadcast {
                payload["broadcastToAll"] = true
            } else if let devId = toDeviceId {
                payload["deviceId"] = devId
            }

            emitEvent(["TEACHER_SEND_FILE", payload])
        } catch {
            log("[ARCHIVO ERROR] No se pudo leer el archivo local: \(error.localizedDescription)")
            activeTransfer?.status = .failed
            activeTransfer?.errorMessage = error.localizedDescription
        }
    }

    public func collectFile(deviceId: String, filePath: String) {
        log("[ARCHIVO] Solicitando recolección de \(filePath) desde equipo \(deviceId)")
        emitEvent(["TEACHER_COLLECT_FILE", [
            "deviceId": deviceId,
            "filePath": filePath
        ]])
    }

    public func listRemoteDirectory(deviceId: String, dirPath: String? = nil, completion: @escaping ([RemoteFileItem]) -> Void) {
        self.onRemoteDirListed = completion
        var payload: [String: Any] = ["deviceId": deviceId]
        if let p = dirPath { payload["dirPath"] = p }
        emitEvent(["TEACHER_LIST_DIR", payload])
    }

    private func saveCollectedFileData(data: Data, fileName: String, sha256: String) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first!
        let folder = downloads.appendingPathComponent("AssetSchool_Collected", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        let safeName = "Trabajo_\(Date().formatted(date: .numeric, time: .standard).replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-"))_\(fileName)"
        let target = folder.appendingPathComponent(safeName)

        do {
            try data.write(to: target, options: .atomic)
            self.lastCollectedFile = (name: fileName, path: target.path, date: Date())
            self.log("[ARCHIVO RECOLECTADO] Guardado exitosamente en: \(target.path) (\(data.count) bytes, SHA-256: \(sha256.prefix(8))...)")
        } catch {
            self.log("[ARCHIVO ERROR] Error al guardar archivo recolectado: \(error.localizedDescription)")
        }
    }

    // ==========================================
    // POWER MANAGEMENT
    // ==========================================

    public func powerAction(operation: String, targetDeviceId: String? = nil, delaySeconds: Int = 5, reason: String = "Orden del profesor") {
        log("[ENERGÍA] Operación \(operation) en \(targetDeviceId ?? "todas las estaciones")")
        var payload: [String: Any] = [
            "operation": operation,
            "delaySeconds": delaySeconds,
            "reason": reason,
            "force": true,
            "classroomId": activeClassroom.id
        ]
        if let target = targetDeviceId {
            payload["targetDeviceId"] = target
        }
        emitEvent(["TEACHER_POWER_ACTION", payload])
    }

    // ==========================================
    // SCREEN BROADCAST (MEDIASOUP SFU)
    // ==========================================

    public func startTeacherBroadcast(mode: String = "fullscreen") {
        log("[BROADCAST] Inicializando captura y codificación H.264 WebRTC nativa (\(mode))...")
        isBroadcastingScreen = true
        Task {
            do {
                let sdpOffer = try await self.broadcastEngine.startBroadcast(fps: 30)
                let payload: [String: Any] = [
                    "mode": mode,
                    "fps": 30,
                    "bitrateKbps": 2500,
                    "sdpOffer": sdpOffer,
                    "classroomId": activeClassroom.id
                ]
                await MainActor.run {
                    self.emitEvent(["TEACHER_BROADCAST_START", payload])
                }
            } catch {
                await MainActor.run {
                    self.isBroadcastingScreen = false
                    self.log("[BROADCAST ERROR] Fallo al iniciar emisión WebRTC: \(error.localizedDescription)")
                }
            }
        }
    }

    public func stopTeacherBroadcast() {
        log("[BROADCAST] Deteniendo transmisión docente y liberando recursos...")
        isBroadcastingScreen = false
        broadcastEngine.stop()
        emitEvent(["TEACHER_BROADCAST_STOP", ["classroomId": activeClassroom.id]])
    }

    // ==========================================
    // REMOTE CONTROL INPUT INJECTION
    // ==========================================

    public func sendRemoteInput(
        deviceId: String,
        type: String,
        x: Double? = nil,
        y: Double? = nil,
        button: String? = nil,
        keyCode: Int? = nil,
        keyText: String? = nil
    ) {
        var inputDict: [String: Any] = ["type": type]
        if let x = x { inputDict["x"] = x }
        if let y = y { inputDict["y"] = y }
        if let button = button { inputDict["button"] = button }
        if let keyCode = keyCode { inputDict["keyCode"] = keyCode }
        if let keyText = keyText { inputDict["keyText"] = keyText }

        emitEvent(["TEACHER_REMOTE_INPUT", ["deviceId": deviceId, "input": inputDict]])
    }

    private func emitEvent(_ eventArray: [Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: eventArray),
              let jsonText = String(data: data, encoding: .utf8) else { return }
        let packet = "42\(jsonText)"
        webSocketTask?.send(.string(packet)) { error in
            if let err = error {
                print("[GatewayClient] Error enviando paquete: \(err)")
            }
        }
    }

    private func startPingTimer() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 25.0, repeats: true) { [weak self] _ in
            self?.webSocketTask?.send(.string("2")) { _ in }
        }
    }

    private func log(_ message: String) {
        let line = "[\(Date().formatted(date: .omitted, time: .standard))] \(message)"
        print(line)
        self.lastLog = line
    }
}
