import Foundation

/// Reporte de capacidades nativas para macOS Ventura (13.0+) y Sonoma (14.0+)
/// macOS impone estrictas restricciones TCC (Transparency, Consent, and Control).
public struct MacOSCapabilityReporter {
    public static func report(deviceId: String) -> [String: Any] {
        return [
            "deviceId": deviceId,
            "osType": "macos",
            // ScreenCaptureKit permite streaming de pantalla si el usuario concede permiso en TCC
            "canScreenBroadcast": true,
            "canScreenReceive": true,
            // Remote Input y Lock Input requieren permiso de Accesibilidad
            "canRemoteInput": true,
            "canLockInput": true,
            "canBlackoutScreen": true,
            "canFileTransfer": true,
            // Terminación de procesos vía proc_terminate / kill
            "canProcessBlock": false, // En macOS no se deben simular bloqueos de proceso sin daemon root
            "canUrlBlock": true,     // Mediante proxy de bucle invertido o Network Extension autorizada
            "canChat": true,
            "canExecuteCommand": true,
            "canCollectHardwareInventory": true, // sysctl y system_profiler
            "platformNotes": "macOS nativo Swift. Requiere autorización TCC para ScreenCaptureKit y Accesibilidad."
        ]
    }
}
