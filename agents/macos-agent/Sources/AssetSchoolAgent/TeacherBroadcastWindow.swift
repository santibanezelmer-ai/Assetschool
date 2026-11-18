import Foundation
import AppKit

/// Native macOS Presentation Viewport Window (Transmisión de Pantalla Docente).
/// Opens on the student's workstation when the teacher starts a live screen broadcast (fullscreen or windowed).
public final class TeacherBroadcastManager {
    public static let shared = TeacherBroadcastManager()

    private var broadcastWindow: NSWindow?
    private var imageView: NSImageView?
    public private(set) var isBroadcasting: Bool = false

    public init() {}

    public func startBroadcast(teacherName: String = "el Docente", mode: String = "fullscreen") {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopBroadcast() // Close any prior window

            self.isBroadcasting = true
            let screen = NSScreen.main ?? NSScreen.screens.first
            let screenFrame = screen?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)

            let isFullscreen = (mode.lowercased() == "fullscreen")
            let rect: NSRect
            let styleMask: NSWindow.StyleMask

            if isFullscreen {
                rect = screenFrame
                styleMask = [.borderless]
            } else {
                let w: CGFloat = min(1200, screenFrame.width * 0.85)
                let h: CGFloat = min(750, screenFrame.height * 0.85)
                let x = (screenFrame.width - w) / 2
                let y = (screenFrame.height - h) / 2
                rect = NSRect(x: x, y: y, width: w, height: h)
                styleMask = [.titled, .closable, .miniaturizable, .resizable]
            }

            let window = NSWindow(
                contentRect: rect,
                styleMask: styleMask,
                backing: .buffered,
                defer: false
            )

            if isFullscreen {
                window.level = .floating
                window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            } else {
                window.title = "Presentación de Pantalla del Docente — \(teacherName)"
            }

            window.backgroundColor = NSColor(red: 0.05, green: 0.07, blue: 0.12, alpha: 1.0)
            window.isOpaque = true

            // Content container
            let container = NSView(frame: rect)
            container.wantsLayer = true
            container.layer?.backgroundColor = NSColor(red: 0.05, green: 0.07, blue: 0.12, alpha: 1.0).cgColor

            // Header Banner
            let headerHeight: CGFloat = 44
            let header = NSView(frame: NSRect(x: 0, y: rect.height - headerHeight, width: rect.width, height: headerHeight))
            header.wantsLayer = true
            header.layer?.backgroundColor = NSColor(red: 0.08, green: 0.12, blue: 0.22, alpha: 0.95).cgColor

            let headerLabel = NSTextField(labelWithString: "📡 Transmisión en Vivo: Pantalla del Profesor (\(teacherName))")
            headerLabel.frame = NSRect(x: 20, y: 12, width: rect.width - 40, height: 20)
            headerLabel.font = NSFont.systemFont(ofSize: 13, weight: .bold)
            headerLabel.textColor = NSColor(red: 0.38, green: 0.76, blue: 0.98, alpha: 1.0)
            header.addSubview(headerLabel)
            container.addSubview(header)

            // Video / Image Viewport
            let viewport = NSImageView(frame: NSRect(x: 0, y: 0, width: rect.width, height: rect.height - headerHeight))
            viewport.imageScaling = .scaleProportionallyUpOrDown
            viewport.autoresizingMask = [.width, .height]
            self.imageView = viewport
            container.addSubview(viewport)

            // Status message until first frame arrives
            let placeholder = NSTextField(labelWithString: "Conectando al stream de video del docente...")
            placeholder.frame = NSRect(x: 20, y: (rect.height - headerHeight) / 2, width: rect.width - 40, height: 24)
            placeholder.font = NSFont.systemFont(ofSize: 15, weight: .medium)
            placeholder.textColor = .lightGray
            placeholder.alignment = .center
            container.addSubview(placeholder)

            window.contentView = container
            window.makeKeyAndOrderFront(nil)
            self.broadcastWindow = window

            print("==========================================================================")
            print("[PRESENTACIÓN DOCENTE] 📡 Ventana de transmisión iniciada (\(mode)). Docente: \(teacherName)")
            print("==========================================================================")
        }
    }

    public func updateFrame(image: NSImage) {
        DispatchQueue.main.async { [weak self] in
            self?.imageView?.image = image
        }
    }

    public func stopBroadcast() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isBroadcasting else { return }
            self.isBroadcasting = false
            self.broadcastWindow?.orderOut(nil)
            self.broadcastWindow = nil
            self.imageView = nil
            print("[PRESENTACIÓN DOCENTE] 🛑 Ventana de transmisión cerrada.")
        }
    }
}
