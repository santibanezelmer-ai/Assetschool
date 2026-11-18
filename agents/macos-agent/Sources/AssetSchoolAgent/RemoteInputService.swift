import AppKit
import ApplicationServices
import Foundation

/// Native macOS Remote Input Injection Service.
/// Accurately maps normalized teacher viewport coordinates (0.0 to 1.0) into
/// local macOS display coordinates and injects mouse and keyboard events via CoreGraphics CGEvent.
/// Checks accessibility TCC privileges and activates visible privacy notifications.
public final class RemoteInputService {
    public static let shared = RemoteInputService()
    
    public private(set) var isRemoteControlActive: Bool = false
    private var idleTimer: Timer?
    
    private init() {}
    
    /// Checks whether the agent has macOS Accessibility (TCC) privileges to inject input events
    public var isAccessibilityTrusted: Bool {
        return AXIsProcessTrusted()
    }

    /// Explicitly activates a remote control session and raises privacy indicator
    public func startRemoteControl(teacherName: String = "el Docente") {
        DispatchQueue.main.async { [weak self] in
            self?.isRemoteControlActive = true
            CaptureIndicatorWindow.shared.showRemoteControl(teacherName: teacherName)
            self?.resetIdleTimer()
        }
    }

    /// Ends remote control session and hides privacy indicator
    public func endRemoteControl() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isRemoteControlActive else { return }
            self.isRemoteControlActive = false
            self.idleTimer?.invalidate()
            self.idleTimer = nil
            CaptureIndicatorWindow.shared.hide()
            print("[REMOTE INPUT] Sesión de control remoto finalizada.")
        }
    }

    private func resetIdleTimer() {
        idleTimer?.invalidate()
        // If no input received for 10 seconds, return indicator to idle
        idleTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
            self?.endRemoteControl()
        }
    }
    
    /// Process incoming remote input event from teacher console
    public func handleRemoteInput(type: String, x: Double?, y: Double?, button: String?, keyCode: UInt16?, keyText: String?) {
        guard isAccessibilityTrusted else {
            print("[REMOTE INPUT WARNING] Evento descartado: El agente no tiene permisos de Accesibilidad TCC otorgados en Preferencias del Sistema -> Privacidad y Seguridad -> Accesibilidad.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.startRemoteControl()
        }
        
        // Primary display resolution
        let primaryScreen = NSScreen.main ?? NSScreen.screens.first
        let screenWidth = primaryScreen?.frame.width ?? 1920
        let screenHeight = primaryScreen?.frame.height ?? 1080
        
        // Normalized top-left coordinates clamped between 0.0 and 1.0
        let normX = max(0.0, min(1.0, x ?? 0.5))
        let normY = max(0.0, min(1.0, y ?? 0.5))
        
        // CoreGraphics global display coordinates: (0,0) is top-left
        let targetX = CGFloat(normX) * screenWidth
        let targetY = CGFloat(normY) * screenHeight
        let targetPoint = CGPoint(x: targetX, y: targetY)
        
        switch type {
        case "mouseMove":
            if let event = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: targetPoint, mouseButton: .left) {
                event.post(tap: .cghidEventTap)
            }
            
        case "mouseDown":
            let mouseType: CGEventType = (button == "right") ? .rightMouseDown : .leftMouseDown
            let mouseButton: CGMouseButton = (button == "right") ? .right : .left
            if let event = CGEvent(mouseEventSource: nil, mouseType: mouseType, mouseCursorPosition: targetPoint, mouseButton: mouseButton) {
                event.post(tap: .cghidEventTap)
            }
            
        case "mouseUp":
            let mouseType: CGEventType = (button == "right") ? .rightMouseUp : .leftMouseUp
            let mouseButton: CGMouseButton = (button == "right") ? .right : .left
            if let event = CGEvent(mouseEventSource: nil, mouseType: mouseType, mouseCursorPosition: targetPoint, mouseButton: mouseButton) {
                event.post(tap: .cghidEventTap)
            }
            
        case "click":
            let isRight = (button == "right")
            let downType: CGEventType = isRight ? .rightMouseDown : .leftMouseDown
            let upType: CGEventType = isRight ? .rightMouseUp : .leftMouseUp
            let btn: CGMouseButton = isRight ? .right : .left
            
            if let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: targetPoint, mouseButton: btn),
               let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: targetPoint, mouseButton: btn) {
                down.post(tap: .cghidEventTap)
                usleep(15000) // 15ms click duration
                up.post(tap: .cghidEventTap)
            }
            
        case "doubleClick":
            if let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: targetPoint, mouseButton: .left),
               let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: targetPoint, mouseButton: .left) {
                down.setIntegerValueField(.mouseEventClickState, value: 1)
                down.post(tap: .cghidEventTap)
                up.post(tap: .cghidEventTap)
                usleep(20000)
                down.setIntegerValueField(.mouseEventClickState, value: 2)
                down.post(tap: .cghidEventTap)
                up.post(tap: .cghidEventTap)
            }
            
        case "keyDown":
            if let code = keyCode {
                if let event = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: true) {
                    event.post(tap: .cghidEventTap)
                }
            }
            
        case "keyUp":
            if let code = keyCode {
                if let event = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: false) {
                    event.post(tap: .cghidEventTap)
                }
            }
            
        default:
            break
        }
    }
}
