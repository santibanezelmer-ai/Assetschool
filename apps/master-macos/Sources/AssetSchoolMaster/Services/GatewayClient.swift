import Foundation
import Combine
import AppKit

public class MasterGatewayClient: ObservableObject {
    public static let shared = MasterGatewayClient()

    @Published public var isConnected: Bool = false
    @Published public var serverHost: String = "127.0.0.1"
    @Published public var serverPort: Int = 3000
    @Published public var devices: [StudentDevice] = []
    @Published public var statusMessage: String = "Desconectado"
    @Published public var isBroadcastingScreen: Bool = false
    @Published public var lastLog: String = ""

    private var webSocketTask: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var token: String?
    private let session = URLSession(configuration: .default)

    public init() {}

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
            if eventName == "DEVICE_LIST" || eventName == "CLASSROOM_SNAPSHOT" {
                if array.count > 1, let payload = array[1] as? [[String: Any]] {
                    self.updateDeviceList(payload)
                }
            } else if eventName == "DEVICE_STATUS_CHANGE" || eventName == "DEVICE_STATUS_CHANGED" {
                if array.count > 1, let payload = array[1] as? [String: Any] {
                    self.updateSingleDevice(payload)
                }
            } else if eventName == "LOCK_STATUS_CHANGE" {
                if array.count > 1, let payload = array[1] as? [String: Any],
                   let deviceId = payload["deviceId"] as? String,
                   let locked = payload["locked"] as? Bool {
                    if let dev = self.devices.first(where: { $0.id == deviceId }) {
                        dev.isLocked = locked
                        dev.status = locked ? .locked : .online
                    }
                }
            } else if eventName == "DEVICE_THUMBNAIL" {
                if array.count > 1, let payload = array[1] as? [String: Any],
                   let deviceId = payload["deviceId"] as? String,
                   let b64 = payload["thumbnailBase64"] as? String,
                   let data = Data(base64Encoded: b64),
                   let image = NSImage(data: data) {
                    if let dev = self.devices.first(where: { $0.id == deviceId }) {
                        dev.thumbnail = image
                    }
                }
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

            let dev = StudentDevice(id: id, hostname: hostname, osType: os, localIp: ip, status: status)
            dev.isLocked = isLocked
            dev.currentStudentName = item["currentStudentName"] as? String
            updated.append(dev)
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
        } else {
            let hostname = payload["hostname"] as? String ?? "Host-\(id.prefix(4))"
            let dev = StudentDevice(id: id, hostname: hostname)
            devices.append(dev)
        }
    }

    private func joinClassroom() {
        var payload: [String: Any] = ["classroomId": "d1111111-1111-1111-1111-111111111111"]
        if let t = token {
            payload["token"] = t
        }
        let event = ["TEACHER_JOIN_CLASSROOM", payload] as [Any]
        emitEvent(event)
    }

    // ==========================================
    // VEYON MODULE ACTIONS (DISPATCH COMMANDS)
    // ==========================================

    public func lockAll(message: String = "Atención al frente. Pausa pedagógica activa.") {
        log("[COMANDO] Bloquear toda el aula")
        emitEvent(["TEACHER_LOCK_CLASSROOM", ["message": message]])
        for dev in devices {
            dev.isLocked = true
            dev.status = .locked
        }
    }

    public func unlockAll() {
        log("[COMANDO] Desbloquear toda el aula")
        emitEvent(["TEACHER_UNLOCK_CLASSROOM", [:]])
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

    public func sendPopupMessage(title: String, message: String, targetDeviceId: String? = nil, priority: String = "normal") {
        log("[MENSAJE] Enviando '\(title)' a \(targetDeviceId ?? "todos")")
        var payload: [String: Any] = [
            "title": title,
            "message": message,
            "priority": priority
        ]
        if let target = targetDeviceId {
            payload["targetDeviceId"] = target
        }
        emitEvent(["TEACHER_SEND_POPUP_MESSAGE", payload])
    }

    public func powerAction(operation: String, targetDeviceId: String? = nil, delaySeconds: Int = 5, reason: String = "Orden del profesor") {
        log("[ENERGÍA] Operación \(operation) en \(targetDeviceId ?? "todas las estaciones")")
        var payload: [String: Any] = [
            "operation": operation,
            "delaySeconds": delaySeconds,
            "reason": reason,
            "force": true
        ]
        if let target = targetDeviceId {
            payload["targetDeviceId"] = target
        }
        emitEvent(["TEACHER_POWER_ACTION", payload])
    }

    public func startTeacherBroadcast(mode: String = "fullscreen") {
        log("[BROADCAST] Iniciando transmisión docente (\(mode))")
        isBroadcastingScreen = true
        emitEvent(["TEACHER_BROADCAST_START", ["mode": mode, "fps": 30, "bitrateKbps": 2500]])
    }

    public func stopTeacherBroadcast() {
        log("[BROADCAST] Deteniendo transmisión docente")
        isBroadcastingScreen = false
        emitEvent(["TEACHER_BROADCAST_STOP", [:]])
    }

    public func sendRemoteInput(deviceId: String, type: String, x: Double? = nil, y: Double? = nil, button: String? = nil, keyCode: Int? = nil, keyText: String? = nil) {
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
