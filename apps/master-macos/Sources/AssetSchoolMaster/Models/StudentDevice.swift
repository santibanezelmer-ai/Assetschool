import Foundation
import AppKit

public enum MasterDevicePlatform: String, Codable {
    case windows = "windows"
    case macos = "macos"
    case linux = "linux"
    case chromeos = "chromeos"
    case unknown = "unknown"
}

public enum MasterDeviceStatus: String, Codable {
    case online = "online"
    case locked = "locked"
    case offline = "offline"
    case busy = "busy"
}

public class StudentDevice: Identifiable, ObservableObject {
    public let id: String
    @Published public var hostname: String
    @Published public var osType: MasterDevicePlatform
    @Published public var osVersion: String
    @Published public var localIp: String
    @Published public var status: MasterDeviceStatus
    @Published public var isLocked: Bool = false
    @Published public var isSelected: Bool = false
    @Published public var currentStudentName: String?
    @Published public var classroomName: String?
    @Published public var lastHeartbeat: Date = Date()
    @Published public var thumbnail: NSImage?
    @Published public var activeFps: Int = 0
    @Published public var activeBitrateKbps: Int = 0

    public init(
        id: String,
        hostname: String,
        osType: MasterDevicePlatform = .unknown,
        osVersion: String = "",
        localIp: String = "127.0.0.1",
        status: MasterDeviceStatus = .online,
        currentStudentName: String? = nil,
        classroomName: String? = "Laboratorio 1"
    ) {
        self.id = id
        self.hostname = hostname
        self.osType = osType
        self.osVersion = osVersion
        self.localIp = localIp
        self.status = status
        self.currentStudentName = currentStudentName
        self.classroomName = classroomName
    }

    /// Returns true if more than 10 seconds elapsed since the last response or thumbnail
    public var isConnectionStale: Bool {
        return Date().timeIntervalSince(lastHeartbeat) > 10.0
    }

    /// Returns true if more than 30 seconds elapsed or status is offline
    public var isDisconnected: Bool {
        return status == .offline || Date().timeIntervalSince(lastHeartbeat) > 30.0
    }

    /// User-friendly last communication timestamp
    public var lastCommunicationFormatted: String {
        let diff = Int(Date().timeIntervalSince(lastHeartbeat))
        if diff < 3 {
            return "En tiempo real"
        } else if diff < 60 {
            return "Hace \(diff)s"
        } else {
            let mins = diff / 60
            return "Hace \(mins)m"
        }
    }

    public var osNameFormatted: String {
        switch osType {
        case .macos: return "macOS \(osVersion)"
        case .windows: return "Windows \(osVersion)"
        case .linux: return "Linux"
        case .chromeos: return "ChromeOS"
        case .unknown: return "Desconocido"
        }
    }

    public func toggleSelected() {
        self.isSelected.toggle()
    }
}
