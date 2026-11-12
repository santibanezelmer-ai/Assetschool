import Foundation

public final class FileManagerService {
    public static let shared = FileManagerService()
    
    private let fileManager = FileManager.default
    
    private init() {}
    
    /// Returns the base directory for school work / downloads
    public var defaultSchoolFolder: URL {
        let downloads = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first!
        let schoolFolder = downloads.appendingPathComponent("AssetSchool", isDirectory: true)
        if !fileManager.fileExists(atPath: schoolFolder.path) {
            try? fileManager.createDirectory(at: schoolFolder, withIntermediateDirectories: true)
        }
        return schoolFolder
    }
    
    /// Resolve path safely within user scope
    private func resolvePath(_ rawPath: String?) -> URL {
        let home = fileManager.homeDirectoryForCurrentUser
        guard let path = rawPath, !path.isEmpty, path != "~" else {
            return defaultSchoolFolder
        }
        
        if path.hasPrefix("~/") {
            let subPath = String(path.dropFirst(2))
            return home.appendingPathComponent(subPath)
        } else if path.hasPrefix("/") {
            return URL(fileURLWithPath: path)
        } else {
            return defaultSchoolFolder.appendingPathComponent(path)
        }
    }
    
    /// Lists contents of a directory for remote exploration
    public func listDirectory(path: String?) -> (currentPath: String, parentPath: String?, items: [[String: Any]], error: String?) {
        let targetUrl = resolvePath(path)
        
        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: targetUrl.path, isDirectory: &isDir), isDir.boolValue else {
            return (targetUrl.path, nil, [], "El directorio no existe o no es accesible: \(targetUrl.path)")
        }
        
        let parentPath = targetUrl.path == fileManager.homeDirectoryForCurrentUser.path ? nil : targetUrl.deletingLastPathComponent().path
        
        do {
            let contents = try fileManager.contentsOfDirectory(at: targetUrl, includingPropertiesForKeys: [
                .fileSizeKey,
                .isDirectoryKey,
                .contentModificationDateKey
            ], options: [.skipsHiddenFiles])
            
            var items: [[String: Any]] = []
            
            for url in contents {
                let resourceValues = try? url.resourceValues(forKeys: [.fileSizeKey, .isDirectoryKey, .contentModificationDateKey])
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
    
    /// Save an incoming file from the teacher onto the student's machine
    public func saveIncomingFile(fileName: String, base64Content: String, targetDir: String?) -> (success: Bool, savedPath: String?, error: String?) {
        guard let data = Data(base64Encoded: base64Content) else {
            return (false, nil, "Error al decodificar archivo Base64")
        }
        
        let targetDirectoryUrl: URL
        if let dir = targetDir, !dir.isEmpty {
            targetDirectoryUrl = resolvePath(dir)
        } else {
            targetDirectoryUrl = defaultSchoolFolder
        }
        
        try? fileManager.createDirectory(at: targetDirectoryUrl, withIntermediateDirectories: true)
        let destinationUrl = targetDirectoryUrl.appendingPathComponent(fileName)
        
        do {
            try data.write(to: destinationUrl, options: .atomic)
            print("[FILE MANAGER] Archivo recibido y guardado con éxito en: \(destinationUrl.path) (\(data.count) bytes)")
            return (true, destinationUrl.path, nil)
        } catch {
            return (false, nil, "Error al escribir archivo en disco: \(error.localizedDescription)")
        }
    }
    
    /// Read a student's file to send back to the teacher (collect work)
    public func readFileToCollect(path: String) -> (success: Bool, fileName: String, size: Int, base64Content: String?, error: String?) {
        let fileUrl = URL(fileURLWithPath: path)
        
        guard fileManager.fileExists(atPath: fileUrl.path) else {
            return (false, fileUrl.lastPathComponent, 0, nil, "El archivo solicitado no existe: \(fileUrl.path)")
        }
        
        do {
            let data = try Data(contentsOf: fileUrl)
            let base64 = data.base64EncodedString()
            print("[FILE MANAGER] Archivo leído para recolección docente: \(fileUrl.path) (\(data.count) bytes)")
            return (true, fileUrl.lastPathComponent, data.count, base64, nil)
        } catch {
            return (false, fileUrl.lastPathComponent, 0, nil, "Error al leer archivo: \(error.localizedDescription)")
        }
    }
}
