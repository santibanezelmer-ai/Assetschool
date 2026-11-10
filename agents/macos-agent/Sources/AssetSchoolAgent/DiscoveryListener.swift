import Foundation
import Darwin

public struct DiscoveredServer: Sendable {
    public let serverId: String
    public let serverVersion: String
    public let protocolVersion: String
    public let serverHost: String
    public let httpPort: Int
    public let wsPort: Int
    public let wsPath: String
    public let wsUrl: String
    public let httpUrl: String
    public let institutionId: String
    public let institutionCode: String
    public let institutionName: String
    public let timestamp: Int64
    public let senderIp: String
}

public class DiscoveryListener {
    private var socketFd: Int32 = -1
    private var isListening: Bool = false
    private let port: UInt16
    private let queue = DispatchQueue(label: "com.assetschool.agent.discovery", qos: .userInitiated)
    
    public var onServerDiscovered: ((DiscoveredServer) -> Void)?
    public var onError: ((String) -> Void)?
    
    public init(port: UInt16 = 48500) {
        self.port = port
    }
    
    deinit {
        stop()
    }
    
    public func start() -> Bool {
        guard !isListening else { return true }
        
        let fd = socket(AF_INET, SOCK_DGRAM, 0)
        guard fd >= 0 else {
            onError?("No se pudo crear el socket UDP: \(errno)")
            return false
        }
        
        var reuse: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &reuse, socklen_t(MemoryLayout<Int32>.size))
        
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(port.bigEndian)
        addr.sin_addr.s_addr = in_addr_t(0) // INADDR_ANY
        
        let bindRes = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { saPtr in
                Darwin.bind(fd, saPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        
        guard bindRes == 0 else {
            Darwin.close(fd)
            onError?("Fallo al enlazar socket UDP al puerto \(port): \(errno)")
            return false
        }
        
        self.socketFd = fd
        self.isListening = true
        
        queue.async { [weak self] in
            self?.receiveLoop()
        }
        
        return true
    }
    
    public func stop() {
        guard isListening else { return }
        isListening = false
        if socketFd >= 0 {
            Darwin.close(socketFd)
            socketFd = -1
        }
    }
    
    private func receiveLoop() {
        var buffer = [UInt8](repeating: 0, count: 4096)
        var clientAddr = sockaddr_in()
        var addrLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        
        while isListening && socketFd >= 0 {
            let bytesRead = withUnsafeMutablePointer(to: &clientAddr) { clientPtr in
                clientPtr.withMemoryRebound(to: sockaddr.self, capacity: 1) { saPtr in
                    recvfrom(socketFd, &buffer, buffer.count, 0, saPtr, &addrLen)
                }
            }
            
            guard bytesRead > 0 else {
                if !isListening { break }
                continue
            }
            
            // Extract sender IP
            var ipBuffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            var sinAddr = clientAddr.sin_addr
            inet_ntop(AF_INET, &sinAddr, &ipBuffer, socklen_t(INET_ADDRSTRLEN))
            let senderIp = String(cString: ipBuffer)
            
            let data = Data(buffer[0..<bytesRead])
            handleIncomingPacket(data: data, senderIp: senderIp)
        }
    }
    
    private func isPrivateOrLoopbackIp(_ ip: String) -> Bool {
        if ip == "127.0.0.1" || ip.hasPrefix("127.") { return true }
        if ip.hasPrefix("10.") { return true }
        if ip.hasPrefix("192.168.") { return true }
        if ip.hasPrefix("172.") {
            let parts = ip.split(separator: ".").compactMap { Int($0) }
            if parts.count >= 2 && parts[0] == 172 && (16...31).contains(parts[1]) {
                return true
            }
        }
        return false
    }
    
    private func handleIncomingPacket(data: Data, senderIp: String) {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[DISCOVERY SEGURIDAD] Paquete descartado: no es JSON válido (desde \(senderIp))")
            return
        }
        
        guard let packetType = json["packetType"] as? String, packetType == "DISCOVERY_BEACON" else {
            return
        }
        
        guard let protocolVersion = json["protocolVersion"] as? String, protocolVersion == "1.0.0" else {
            print("[DISCOVERY SEGURIDAD] Versión de protocolo incompatible en baliza: \(json["protocolVersion"] ?? "desconocida")")
            return
        }
        
        guard let payload = json["payload"] as? [String: Any] else {
            print("[DISCOVERY SEGURIDAD] Baliza descartada: payload ausente o inválido")
            return
        }
        
        guard let serverId = payload["serverId"] as? String, !serverId.isEmpty,
              let serverVersion = payload["serverVersion"] as? String,
              let serverHost = payload["serverHost"] as? String,
              let httpPort = payload["httpPort"] as? Int, (1...65535).contains(httpPort),
              let wsPort = payload["wsPort"] as? Int, (1...65535).contains(wsPort),
              let institutionId = payload["institutionId"] as? String, !institutionId.isEmpty else {
            print("[DISCOVERY SEGURIDAD] Baliza descartada: campos obligatorios ausentes en payload")
            return
        }
        
        // Security check: Private network verification (RFC 1918 / Loopback)
        guard isPrivateOrLoopbackIp(serverHost) && isPrivateOrLoopbackIp(senderIp) else {
            print("[DISCOVERY ALERTA SEGURIDAD] Baliza rechazada: IP no pertenece a rangos LAN RFC 1918 ni bucle local (Host: \(serverHost), Sender: \(senderIp))")
            return
        }
        
        let wsPath = (payload["wsPath"] as? String) ?? "/socket.io"
        let wsUrl = (payload["wsUrl"] as? String) ?? "http://\(serverHost):\(wsPort)\(wsPath)"
        let httpUrl = (payload["httpUrl"] as? String) ?? "http://\(serverHost):\(httpPort)/api/v1"
        let institutionCode = (payload["institutionCode"] as? String) ?? ""
        let institutionName = (payload["institutionName"] as? String) ?? ""
        let timestamp = (payload["timestamp"] as? Int64) ?? Int64(Date().timeIntervalSince1970 * 1000)
        
        let server = DiscoveredServer(
            serverId: serverId,
            serverVersion: serverVersion,
            protocolVersion: protocolVersion,
            serverHost: serverHost,
            httpPort: httpPort,
            wsPort: wsPort,
            wsPath: wsPath,
            wsUrl: wsUrl,
            httpUrl: httpUrl,
            institutionId: institutionId,
            institutionCode: institutionCode,
            institutionName: institutionName,
            timestamp: timestamp,
            senderIp: senderIp
        )
        
        DispatchQueue.main.async { [weak self] in
            self?.onServerDiscovered?(server)
        }
    }
}
