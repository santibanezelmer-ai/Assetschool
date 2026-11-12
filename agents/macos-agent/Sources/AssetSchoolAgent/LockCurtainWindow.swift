import Foundation
import AppKit

/// Native macOS Fullscreen Pedagogical Lock Curtain (Pantalla de Pausa Pedagógica).
/// Displays an institutional lock overlay and suppresses keyboard/mouse input while active.
public class LockCurtainManager {
    public static let shared = LockCurtainManager()
    
    private var lockWindows: [NSWindow] = []
    private var eventMonitor: Any? = nil
    public private(set) var isLocked: Bool = false
    
    public init() {}
    
    public func show(
        message: String? = nil,
        teacherName: String = "el Docente",
        institutionName: String = "AssetSchool",
        classroomName: String? = nil
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.hide() // Clear any existing windows first
            
            self.isLocked = true
            NSCursor.hide()
            
            // Cover all connected screens
            let screens = NSScreen.screens.isEmpty ? [NSScreen.main].compactMap { $0 } : NSScreen.screens
            
            for screen in screens {
                let window = self.createLockWindow(
                    for: screen,
                    message: message,
                    teacherName: teacherName,
                    institutionName: institutionName,
                    classroomName: classroomName
                )
                window.makeKeyAndOrderFront(nil)
                self.lockWindows.append(window)
            }
            
            // Block local keyboard and mouse events
            self.eventMonitor = NSEvent.addLocalMonitorForEvents(
                matching: [.keyDown, .keyUp, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel]
            ) { event in
                // Intercept and suppress all inputs while locked
                return nil
            }
            
            print("==========================================================================")
            print("[PAUSA PEDAGÓGICA] 🔒 PANTALLA BLOQUEADA POR EL DOCENTE: \(teacherName)")
            if let msg = message, !msg.isEmpty {
                print("[MENSAJE DEL DOCENTE] \"\(msg)\"")
            }
            print("[ENTRADA] Teclado y mouse inhibidos.")
            print("==========================================================================")
        }
    }
    
    public func hide() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.isLocked || !self.lockWindows.isEmpty else { return }
            
            self.isLocked = false
            NSCursor.unhide()
            
            if let monitor = self.eventMonitor {
                NSEvent.removeMonitor(monitor)
                self.eventMonitor = nil
            }
            
            for window in self.lockWindows {
                window.orderOut(nil)
            }
            self.lockWindows.removeAll()
            
            print("==========================================================================")
            print("[PAUSA PEDAGÓGICA] 🟢 PANTALLA DESBLOQUEADA. Control restaurado al estudiante.")
            print("==========================================================================")
        }
    }
    
    private func createLockWindow(
        for screen: NSScreen,
        message: String?,
        teacherName: String,
        institutionName: String,
        classroomName: String?
    ) -> NSWindow {
        let window = NSWindow(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false,
            screen: screen
        )
        
        window.level = .screenSaver
        window.isOpaque = true
        window.backgroundColor = NSColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1.0) // Slate-950
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.ignoresMouseEvents = false
        
        let contentView = NSView(frame: screen.frame)
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = NSColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1.0).cgColor
        
        // Centered container
        let containerWidth: CGFloat = min(720, screen.frame.width - 80)
        let containerHeight: CGFloat = 460
        let containerX = (screen.frame.width - containerWidth) / 2
        let containerY = (screen.frame.height - containerHeight) / 2
        
        let container = NSView(frame: NSRect(x: containerX, y: containerY, width: containerWidth, height: containerHeight))
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor(red: 0.09, green: 0.13, blue: 0.24, alpha: 0.85).cgColor // Slate-900
        container.layer?.cornerRadius = 24
        container.layer?.borderWidth = 1.5
        container.layer?.borderColor = NSColor(red: 0.2, green: 0.3, blue: 0.45, alpha: 0.6).cgColor
        
        // 1. Lock Icon
        let iconView = NSImageView(frame: NSRect(x: (containerWidth - 64) / 2, y: containerHeight - 88, width: 64, height: 64))
        if let lockImg = NSImage(systemSymbolName: "lock.fill", accessibilityDescription: "Bloqueado") {
            let config = NSImage.SymbolConfiguration(pointSize: 48, weight: .bold)
            iconView.image = lockImg.withSymbolConfiguration(config)
            iconView.contentTintColor = NSColor(red: 0.22, green: 0.74, blue: 0.97, alpha: 1.0) // Sky-400
        }
        container.addSubview(iconView)
        
        // 2. Title: ATENCIÓN AL FRENTE
        let titleLabel = NSTextField(labelWithString: "ATENCIÓN AL FRENTE")
        titleLabel.frame = NSRect(x: 20, y: containerHeight - 140, width: containerWidth - 40, height: 42)
        titleLabel.font = NSFont.systemFont(ofSize: 32, weight: .heavy)
        titleLabel.textColor = .white
        titleLabel.alignment = .center
        container.addSubview(titleLabel)
        
        // 3. Subtitle
        let subText = classroomName != nil ? "Clase en pausa pedagógica • \(classroomName!)" : "Clase en pausa pedagógica"
        let subtitleLabel = NSTextField(labelWithString: subText)
        subtitleLabel.frame = NSRect(x: 20, y: containerHeight - 170, width: containerWidth - 40, height: 24)
        subtitleLabel.font = NSFont.systemFont(ofSize: 16, weight: .medium)
        subtitleLabel.textColor = NSColor(red: 0.58, green: 0.64, blue: 0.72, alpha: 1.0) // Slate-400
        subtitleLabel.alignment = .center
        container.addSubview(subtitleLabel)
        
        // 4. Teacher Message Box
        let msgBoxY: CGFloat = 120
        let msgBoxHeight: CGFloat = 130
        let msgBox = NSView(frame: NSRect(x: 36, y: msgBoxY, width: containerWidth - 72, height: msgBoxHeight))
        msgBox.wantsLayer = true
        msgBox.layer?.backgroundColor = NSColor(red: 0.04, green: 0.07, blue: 0.12, alpha: 0.9).cgColor
        msgBox.layer?.cornerRadius = 14
        msgBox.layer?.borderWidth = 1
        msgBox.layer?.borderColor = NSColor(red: 0.14, green: 0.38, blue: 0.6, alpha: 0.5).cgColor
        
        let msgHeader = NSTextField(labelWithString: "Mensaje del Docente:")
        msgHeader.frame = NSRect(x: 16, y: msgBoxHeight - 32, width: containerWidth - 104, height: 20)
        msgHeader.font = NSFont.systemFont(ofSize: 13, weight: .bold)
        msgHeader.textColor = NSColor(red: 0.35, green: 0.75, blue: 0.98, alpha: 1.0) // Sky-400
        msgBox.addSubview(msgHeader)
        
        let actualMsg = (message?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            ? "Por favor dejen el teclado y presten atención a las indicaciones en la pizarra."
            : message!
            
        let msgBody = NSTextField(wrappingLabelWithString: "\"\(actualMsg)\"")
        msgBody.frame = NSRect(x: 16, y: 12, width: containerWidth - 104, height: msgBoxHeight - 48)
        msgBody.font = NSFont.systemFont(ofSize: 17, weight: .regular)
        msgBody.textColor = NSColor(red: 0.95, green: 0.96, blue: 0.98, alpha: 1.0)
        msgBody.alignment = .left
        msgBox.addSubview(msgBody)
        container.addSubview(msgBox)
        
        // 5. Footer: Teacher & Institution info
        let teacherInfo = NSTextField(labelWithString: "Docente a cargo: \(teacherName) • \(institutionName)")
        teacherInfo.frame = NSRect(x: 20, y: 56, width: containerWidth - 40, height: 22)
        teacherInfo.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        teacherInfo.textColor = NSColor(red: 0.8, green: 0.85, blue: 0.9, alpha: 1.0)
        teacherInfo.alignment = .center
        container.addSubview(teacherInfo)
        
        // 6. Blocked banner indicator
        let blockedBanner = NSTextField(labelWithString: "⌨ Teclado y ratón bloqueados temporalmente por la plataforma AssetSchool")
        blockedBanner.frame = NSRect(x: 20, y: 22, width: containerWidth - 40, height: 20)
        blockedBanner.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        blockedBanner.textColor = NSColor(red: 0.96, green: 0.64, blue: 0.38, alpha: 0.9) // Amber-400
        blockedBanner.alignment = .center
        container.addSubview(blockedBanner)
        
        contentView.addSubview(container)
        window.contentView = contentView
        return window
    }
}
