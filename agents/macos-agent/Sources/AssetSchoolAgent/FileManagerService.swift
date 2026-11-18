import Foundation
import CryptoKit

/// R0 / S5: every file operation requested by the teacher is confined to the
/// school sandbox folder (~/Downloads/AssetSchool). Absolute paths outside it,
/// `..` traversal, symbolic links and unsafe file names are rejected.
public final class FileManagerService {
    public static let shared = FileManagerService()

    private let fileManager = FileManager.default
    private let rootOverride: URL?

    private init() {
        self.rootOverride = nil
    }

    /// Test-only initializer with an explicit sandbox root.
    init(sandboxRoot: URL) {
        self.rootOverride = sandboxRoot
    }

    /// Returns the base directory for school work / downloads (the sandbox root).
    public var defaultSchoolFolder: URL {
        let folder: URL
        if let override = rootOverride {
            folder = override
        } else {
            let downloads = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first!
            folder = downloads.appendingPathComponent("AssetSchool", isDirectory: true)
        }
        if !fileManager.fileExists(atPath: folder.path) {
            try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        }
        return folder
    }

    /// Canonical sandbox root (symlinks resolved, e.g. /var -> /private/var).
    private var sandboxRoot: URL {
        defaultSchoolFolder.standardizedFileURL.resolvingSymlinksInPath()
    }

    public enum SandboxError: Error, CustomStringConvertible {
        case outsideSandbox(String)
        case invalidName(String)
        case symbolicLink(String)

        public var description: String {
            switch self {
            case .outsideSandbox(let p): return "Ruta fuera de la carpeta permitida de AssetSchool: \(p)"
            case .invalidName(let n): return "Nombre de archivo no permitido: \(n)"
            case .symbolicLink(let p): return "No se permiten enlaces simbólicos: \(p)"
            }
        }
    }

    func isInsideSandbox(_ url: URL) -> Bool {
        let root = sandboxRoot.path
        let candidate = url.path
        return candidate == root || candidate.hasPrefix(root + "/")
    }

    /// Resolves a requested path and guarantees it stays inside the sandbox.
    /// Accepts paths relative to the sandbox and absolute paths that already
    /// point inside it (the listings return absolute paths).
    func confine(_ rawPath: String?) throws -> URL {
        guard let path = rawPath, !path.isEmpty, path != "~", path != "." else {
            return sandboxRoot
        }
        if path.contains("\u{0}") {
            throw SandboxError.outsideSandbox(path)
        }

        let candidate: URL
        if path.hasPrefix("/") {
            candidate = URL(fileURLWithPath: path)
        } else if path.hasPrefix("~") {
            // Home-relative paths are only honoured if they end up inside the sandbox.
            candidate = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        } else {
            candidate = sandboxRoot.appendingPathComponent(path)
        }

        let resolved = candidate.standardizedFileURL.resolvingSymlinksInPath()
        guard isInsideSandbox(resolved) else {
            throw SandboxError.outsideSandbox(path)
        }
        return resolved
    }

    /// A file name sent by the teacher must be a single, plain path component.
    func validateFileName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed == "." || trimmed == ".." ||
            trimmed.contains("/") || trimmed.contains("\\") || trimmed.contains("\u{0}") ||
            trimmed.hasPrefix(".") {
            throw SandboxError.invalidName(name)
        }
        return trimmed
    }

    private func isSymbolicLink(_ url: URL) -> Bool {
        guard let attrs = try? fileManager.attributesOfItem(atPath: url.path) else { return false }
        return (attrs[.type] as? FileAttributeType) == .typeSymbolicLink
    }

    /// Lists contents of a directory for remote exploration (sandbox only).
    public func listDirectory(path: String?) -> (currentPath: String, parentPath: String?, items: [[String: Any]], error: String?) {
        let targetUrl: URL
        do {
            targetUrl = try confine(path)
        } catch {
            return (sandboxRoot.path, nil, [], "\(error)")
        }

        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: targetUrl.path, isDirectory: &isDir), isDir.boolValue else {
            return (targetUrl.path, nil, [], "El directorio no existe o no es accesible: \(targetUrl.path)")
        }

        let parentPath = targetUrl.path == sandboxRoot.path ? nil : targetUrl.deletingLastPathComponent().path

        do {
            let contents = try fileManager.contentsOfDirectory(at: targetUrl, includingPropertiesForKeys: [
                .fileSizeKey,
                .isDirectoryKey,
                .contentModificationDateKey,
                .isSymbolicLinkKey
            ], options: [.skipsHiddenFiles])

            var items: [[String: Any]] = []

            for url in contents {
                let resourceValues = try? url.resourceValues(forKeys: [.fileSizeKey, .isDirectoryKey, .contentModificationDateKey, .isSymbolicLinkKey])
                // Symbolic links are not exposed: they could point outside the sandbox.
                if resourceValues?.isSymbolicLink == true { continue }
                let isDirectory = resourceValues?.isDirectory ?? false
                let size = resourceValues?.fileSize ?? 0
                let modifiedDate = resourceValues?.contentModificationDate?.timeIntervalSince1970 ?? 0

                let item: [String: Any] = [
                    "name": url.lastPathComponent,
                    "path": url.path,
                    "size": isDirectory ? 0 : size,
                    "isDirectory": isDirectory,
                    "modifiedAt": Int(modifiedDate * 1000),
                    "extension": url.pathExtension.lowercased()
                ]
                items.append(item)
            }

            // Sort: folders first, then alphabetically
            items.sort { a, b in
                let aIsDir = a["isDirectory"] as? Bool ?? false
                let bIsDir = b["isDirectory"] as? Bool ?? false
                if aIsDir != bIsDir {
                    return aIsDir && !bIsDir
                }
                let aName = a["name"] as? String ?? ""
                let bName = b["name"] as? String ?? ""
                return aName.localizedCaseInsensitiveCompare(bName) == .orderedAscending
            }

            return (targetUrl.path, parentPath, items, nil)
        } catch {
            return (targetUrl.path, parentPath, [], "Error al leer directorio: \(error.localizedDescription)")
        }
    }

    /// Active chunk buffers for fragmented file transfer [TransferId: [ChunkIndex: Data]]
    private var pendingChunkBuffers: [String: [Int: Data]] = [:]

    /// Computes the hex SHA-256 string for the provided data
    public static func computeSha256(data: Data) -> String {
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Save an incoming file from the teacher onto the student's machine (sandbox only) with optional SHA-256 verification.
    public func saveIncomingFile(fileName: String, base64Content: String, targetDir: String?, expectedSha256: String? = nil) -> (success: Bool, savedPath: String?, sha256: String?, error: String?) {
        guard let data = Data(base64Encoded: base64Content) else {
            return (false, nil, nil, "Error al decodificar archivo Base64")
        }

        let computedHash = FileManagerService.computeSha256(data: data)
        if let expected = expectedSha256, !expected.isEmpty, computedHash.lowercased() != expected.lowercased() {
            print("[FILE MANAGER ERROR] Discrepancia de integridad SHA-256 en \(fileName). Esperado: \(expected), Calculado: \(computedHash)")
            return (false, nil, computedHash, "Error de integridad: el hash SHA-256 no coincide.")
        }

        do {
            let safeName = try validateFileName(fileName)
            let targetDirectoryUrl = try confine(targetDir)
            try fileManager.createDirectory(at: targetDirectoryUrl, withIntermediateDirectories: true)

            let destinationUrl = targetDirectoryUrl.appendingPathComponent(safeName)
            guard isInsideSandbox(destinationUrl.standardizedFileURL) else {
                throw SandboxError.outsideSandbox(destinationUrl.path)
            }
            if isSymbolicLink(destinationUrl) {
                throw SandboxError.symbolicLink(destinationUrl.path)
            }

            try data.write(to: destinationUrl, options: .atomic)
            print("[FILE MANAGER] Archivo recibido y verificado con éxito (SHA-256: \(computedHash)) en: \(destinationUrl.path) (\(data.count) bytes)")
            return (true, destinationUrl.path, computedHash, nil)
        } catch let error as SandboxError {
            print("[FILE MANAGER] Escritura rechazada: \(error)")
            return (false, nil, computedHash, "\(error)")
        } catch {
            return (false, nil, computedHash, "Error al escribir archivo en disco: \(error.localizedDescription)")
        }
    }

    /// Appends or completes a chunked file transfer
    public func saveFileChunk(
        transferId: String,
        fileName: String,
        chunkIndex: Int,
        totalChunks: Int,
        base64Chunk: String,
        expectedSha256: String?,
        targetDir: String?
    ) -> (completed: Bool, savedPath: String?, sha256: String?, error: String?) {
        guard let chunkData = Data(base64Encoded: base64Chunk) else {
            return (false, nil, nil, "Chunk Base64 inválido")
        }

        if pendingChunkBuffers[transferId] == nil {
            pendingChunkBuffers[transferId] = [:]
        }
        pendingChunkBuffers[transferId]?[chunkIndex] = chunkData

        let receivedCount = pendingChunkBuffers[transferId]?.count ?? 0
        print("[FILE TRANSFER CHUNK] Transferencia \(transferId): bloque \(chunkIndex + 1)/\(totalChunks) recibido (\(chunkData.count) bytes)")

        if receivedCount == totalChunks {
            // Reassemble all chunks in sequential order
            var completeData = Data()
            for idx in 0..<totalChunks {
                guard let part = pendingChunkBuffers[transferId]?[idx] else {
                    return (false, nil, nil, "Bloque faltante en la secuencia: \(idx)")
                }
                completeData.append(part)
            }
            pendingChunkBuffers.removeValue(forKey: transferId)

            let completeBase64 = completeData.base64EncodedString()
            let res = saveIncomingFile(fileName: fileName, base64Content: completeBase64, targetDir: targetDir, expectedSha256: expectedSha256)
            return (res.success, res.savedPath, res.sha256, res.error)
        }

        return (false, nil, nil, nil)
    }

    /// Read a student's file to send back to the teacher (collect work, sandbox only) with SHA-256 checksum.
    public func readFileToCollect(path: String) -> (success: Bool, fileName: String, size: Int, sha256: String?, base64Content: String?, error: String?) {
        let requestedName = (path as NSString).lastPathComponent

        // The unresolved path must not be a symbolic link itself.
        let unresolved = path.hasPrefix("/") ? URL(fileURLWithPath: path) : sandboxRoot.appendingPathComponent(path)
        if isSymbolicLink(unresolved) {
            return (false, requestedName, 0, nil, nil, "\(SandboxError.symbolicLink(path))")
        }

        let fileUrl: URL
        do {
            fileUrl = try confine(path)
        } catch {
            print("[FILE MANAGER] Lectura rechazada: \(error)")
            return (false, requestedName, 0, nil, nil, "\(error)")
        }

        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: fileUrl.path, isDirectory: &isDir), !isDir.boolValue else {
            return (false, fileUrl.lastPathComponent, 0, nil, nil, "El archivo solicitado no existe: \(fileUrl.path)")
        }

        do {
            let data = try Data(contentsOf: fileUrl)
            let sha256 = FileManagerService.computeSha256(data: data)
            let base64 = data.base64EncodedString()
            print("[FILE MANAGER] Archivo leído para recolección docente: \(fileUrl.path) (\(data.count) bytes, SHA-256: \(sha256))")
            return (true, fileUrl.lastPathComponent, data.count, sha256, base64, nil)
        } catch {
            return (false, fileUrl.lastPathComponent, 0, nil, nil, "Error al leer archivo: \(error.localizedDescription)")
        }
    }
}
