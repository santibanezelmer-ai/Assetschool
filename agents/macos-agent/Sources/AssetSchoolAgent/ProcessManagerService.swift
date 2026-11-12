import AppKit
import Foundation

public final class ProcessManagerService {
    public static let shared = ProcessManagerService()
    
    private init() {}
    
    /// Lists currently running user-facing applications
    public func getRunningApplications() -> [[String: Any]] {
        let apps = NSWorkspace.shared.runningApplications
        var list: [[String: Any]] = []
        
        for app in apps {
            // Include regular user applications and accessories with UI
            guard app.activationPolicy == .regular || (app.activationPolicy == .accessory && app.localizedName != nil) else {
                continue
            }
            
            let name = app.localizedName ?? "Proceso Desconocido"
            let bundleId = app.bundleIdentifier ?? ""
            let pid = Int(app.processIdentifier)
            let isFrontmost = app.isActive
            
            let dto: [String: Any] = [
                "pid": pid,
                "name": name,
                "bundleId": bundleId,
                "isFrontmost": isFrontmost
            ]
            list.append(dto)
        }
        
        // Sort: active/frontmost first, then alphabetically
        list.sort { a, b in
            let aFront = a["isFrontmost"] as? Bool ?? false
            let bFront = b["isFrontmost"] as? Bool ?? false
            if aFront != bFront {
                return aFront && !bFront
            }
            let aName = a["name"] as? String ?? ""
            let bName = b["name"] as? String ?? ""
            return aName.localizedCaseInsensitiveCompare(bName) == .orderedAscending
        }
        
        return list
    }
    
    /// Terminate or force kill an application
    public func terminateApplication(pid: pid_t?, bundleId: String?, name: String?) -> (success: Bool, error: String?) {
        let apps = NSWorkspace.shared.runningApplications
        
        let targetApp: NSRunningApplication?
        if let pid = pid, pid > 0 {
            targetApp = apps.first(where: { $0.processIdentifier == pid })
        } else if let bundleId = bundleId, !bundleId.isEmpty {
            targetApp = apps.first(where: { $0.bundleIdentifier == bundleId })
        } else if let name = name, !name.isEmpty {
            targetApp = apps.first(where: { $0.localizedName?.lowercased() == name.lowercased() })
        } else {
            return (false, "Parámetros insuficientes para identificar la aplicación a finalizar")
        }
        
        guard let app = targetApp else {
            return (false, "Aplicación no encontrada en ejecución (puede haberse cerrado previamente)")
        }
        
        let appName = app.localizedName ?? "App"
        print("[PROCESS MANAGER] Finalizando aplicación: \(appName) (PID: \(app.processIdentifier))")
        
        // Try gentle terminate first
        let terminated = app.terminate()
        if !terminated {
            // Force terminate if unresponsive
            let forced = app.forceTerminate()
            if !forced {
                return (false, "No se pudo forzar el cierre de \(appName) (PID: \(app.processIdentifier))")
            }
        }
        
        return (true, nil)
    }
}
