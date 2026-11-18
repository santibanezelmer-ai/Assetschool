import Foundation
import AppKit

/// Floating visible privacy indicator pill for macOS student screen.
/// Alerts the student whenever their screen is actively supervised or controlled by a teacher.
/// Complies with LAN educational transparency standards (Zero-Clandestine operation).
public final class CaptureIndicatorWindow {
    public static let shared = CaptureIndicatorWindow()

    private var indicatorWindow: NSWindow?
    public private(set) var isVisible: Bool = false
    private var hideTimer: Timer?

    public init() {}

    public func show(teacherName: String = "el Docente") {
        showSupervision(teacherName: teacherName)
    }

    public func showSupervision(teacherName: String = "el Docente") {
        DispatchQueue.main.async { [weak self] in
            self?.presentPill(text: "🔴 AssetSchool • Supervisado por \(teacherName)", isControl: false)
        }
    }

    public func showRemoteControl(teacherName: String = "el Docente") {
        DispatchQueue.main.async { [weak self] in
            self?.presentPill(text: "🎮 AssetSchool • Control Remoto (\(teacherName))", isControl: true)
        }
    }

    public func hide() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isVisible else { return }
            self.hideTimer?.invalidate()
            self.hideTimer = nil
            self.indicatorWindow?.orderOut(nil)
            self.indicatorWindow = nil
            self.isVisible = false
            print("[AVISO DE PRIVACIDAD MACOS] 🟢 Supervisión finalizada. Indicador cerrado.")
        }
    }

    private func presentPill(text: String, isControl: Bool) {
        hideTimer?.invalidate()
        hideTimer = nil

        let screen = NSScreen.main ?? NSScreen.screens.first
        guard let screenFrame = screen?.visibleFrame else { return }

        if let existing = indicatorWindow {
            updatePillContent(window: existing, text: text, isControl: isControl)
            existing.orderFront(nil)
            self.isVisible = true
            return
        }

        let width: CGFloat = 280
        let height: CGFloat = 36
        let x = screenFrame.maxX - width - 20
        let y = screenFrame.maxY - height - 12
        let rect = NSRect(x: x, y: y, width: width, height: height)

        let window = NSWindow(
            contentRect: rect,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        window.ignoresMouseEvents = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true

        updatePillContent(window: window, text: text, isControl: isControl)
        window.orderFront(nil)

        self.indicatorWindow = window
        self.isVisible = true
        print("[AVISO DE PRIVACIDAD MACOS] \(text) — Indicador visible en pantalla.")
    }

    private func updatePillContent(window: NSWindow, text: String, isControl: Bool) {
        let bounds = window.contentView?.bounds ?? NSRect(x: 0, y: 0, width: 280, height: 36)
        let pillView = NSView(frame: bounds)
        pillView.wantsLayer = true
        pillView.layer?.cornerRadius = 18
        pillView.layer?.backgroundColor = NSColor(red: 0.08, green: 0.11, blue: 0.18, alpha: 0.92).cgColor
        pillView.layer?.borderWidth = 1.2
        pillView.layer?.borderColor = isControl
            ? NSColor.systemPurple.withAlphaComponent(0.8).cgColor
            : NSColor.systemRed.withAlphaComponent(0.7).cgColor

        let label = NSTextField(labelWithString: text)
        label.frame = NSRect(x: 12, y: 8, width: bounds.width - 24, height: 20)
        label.font = NSFont.systemFont(ofSize: 11, weight: .bold)
        label.textColor = .white
        label.alignment = .center

        pillView.addSubview(label)
        window.contentView = pillView
    }
}
