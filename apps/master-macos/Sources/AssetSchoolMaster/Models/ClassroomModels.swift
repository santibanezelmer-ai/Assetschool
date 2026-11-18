import Foundation
import AppKit

public enum MasterViewMode: String, CaseIterable, Identifiable {
    case grid = "Cuadrícula"
    case list = "Lista Detallada"

    public var id: String { self.rawValue }
    public var iconName: String {
        switch self {
        case .grid: return "square.grid.2x2"
        case .list: return "list.bullet"
        }
    }
}

public struct ClassroomInfo: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let description: String

    public init(id: String, name: String, description: String = "") {
        self.id = id
        self.name = name
        self.description = description
    }
}

public struct RemoteFileItem: Identifiable, Hashable {
    public var id: String { path }
    public let name: String
    public let path: String
    public let size: Int
    public let isDirectory: Bool
    public let modifiedAt: Date
    public let fileExtension: String

    public init(
        name: String,
        path: String,
        size: Int,
        isDirectory: Bool,
        modifiedAt: Date = Date(),
        fileExtension: String = ""
    ) {
        self.name = name
        self.path = path
        self.size = size
        self.isDirectory = isDirectory
        self.modifiedAt = modifiedAt
        self.fileExtension = fileExtension
    }

    public var formattedSize: String {
        if isDirectory { return "--" }
        if size < 1024 { return "\(size) B" }
        let kb = Double(size) / 1024.0
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        let mb = kb / 1024.0
        return String(format: "%.1f MB", mb)
    }

    public var iconName: String {
        if isDirectory { return "folder.fill" }
        switch fileExtension.lowercased() {
        case "pdf": return "doc.richtext"
        case "jpg", "jpeg", "png", "gif": return "photo"
        case "zip", "tar", "gz": return "archivebox"
        case "py", "swift", "js", "ts", "cs", "html", "css": return "curlybraces"
        case "txt", "md": return "doc.text"
        default: return "doc"
        }
    }
}

public enum FileTransferStatus: String {
    case preparing = "Preparando"
    case transferring = "Transfiriendo"
    case verifying = "Verificando SHA-256"
    case completed = "Completado"
    case failed = "Error"
}

public class FileTransferSession: Identifiable, ObservableObject {
    public let id: String
    public let fileName: String
    public let totalBytes: Int
    public let targetSummary: String
    public let isBroadcast: Bool

    @Published public var transferredBytes: Int = 0
    @Published public var progress: Double = 0.0
    @Published public var status: FileTransferStatus = .preparing
    @Published public var sha256: String = ""
    @Published public var errorMessage: String? = nil

    public init(id: String = UUID().uuidString, fileName: String, totalBytes: Int, targetSummary: String, isBroadcast: Bool = false) {
        self.id = id
        self.fileName = fileName
        self.totalBytes = totalBytes
        self.targetSummary = targetSummary
        self.isBroadcast = isBroadcast
    }
}
