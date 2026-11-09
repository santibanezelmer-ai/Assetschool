import Foundation

/// Floating visible indicator banner for macOS student screen.
/// Alerts the student that their screen is actively supervised by the teacher.
public class CaptureIndicatorWindow {
    public private(set) var isVisible: Bool = false

    public init() {}

    public func show(teacherName: String = "el docente") {
        self.isVisible = true
        print("==========================================================================")
        print("[AVISO DE PRIVACIDAD MACOS] 🔴 Tu pantalla está siendo supervisada por \(teacherName).")
        print("[AVISO DE PRIVACIDAD MACOS] AssetSchool LAN Classroom Monitor — Transmisión activa.")
        print("==========================================================================")
    }

    public func hide() {
        guard isVisible else { return }
        self.isVisible = false
        print("[AVISO DE PRIVACIDAD MACOS] 🟢 Supervisión de pantalla finalizada. Indicador cerrado.")
    }
}
