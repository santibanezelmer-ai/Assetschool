import AppKit
import ApplicationServices
import Foundation

public final class RemoteInputService {
    public static let shared = RemoteInputService()
    
    private init() {}
    
    /// Checks whether the agent has macOS Accessibility (TCC) privileges to inject input events
    public var isAccessibilityTrusted: Bool {
        return AXIsProcessTrusted()
    }
    
    /// Process incoming remote input event from teacher console
    public func handleRemoteInput(type: String, x: Double?, y: Double?, button: String?, keyCode: UInt16?, keyText: String?) {
        guard isAccessibilityTrusted else {
            print("[REMOTE INPUT WARNING] Evento descartado: El agente no tiene permisos de Accesibilidad TCC otorgados en Preferencias del Sistema -> Privacidad y Seguridad -> Accesibilidad.")
            return
        }
        
        let screen = NSScreen.main?.frame ?? CGRect(x: 0, y: 0, width: 1920, height: 1080)
        
        // Calculate absolute point on primary display
        let posX = CGFloat(x ?? 0.5) * screen.width
        let posY = CGFloat(y ?? 0.5) * screen.height
        let targetPoint = CGPoint(x: posX, y: posY)
        
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
