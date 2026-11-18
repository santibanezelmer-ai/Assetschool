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
}
