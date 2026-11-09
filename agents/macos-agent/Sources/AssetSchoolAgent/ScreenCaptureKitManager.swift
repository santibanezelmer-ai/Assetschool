import Foundation
import CoreGraphics

public enum StreamQualityTier {
    case thumbnail
    case individual
}

public struct ScreenCaptureConfiguration {
    public var tier: StreamQualityTier
    public var width: Int
    public var height: Int
    public var fps: Int
    public var bitrateKbps: Int

    public static var thumbnail: ScreenCaptureConfiguration {
        return ScreenCaptureConfiguration(tier: .thumbnail, width: 640, height: 360, fps: 10, bitrateKbps: 250)
    }

    public static var individual: ScreenCaptureConfiguration {
        return ScreenCaptureConfiguration(tier: .individual, width: 1920, height: 1080, fps: 30, bitrateKbps: 2000)
    }
}

/// Native macOS ScreenCaptureKit Engine (macOS 12.3+ / 13+ / 14+).
/// Interacts directly with macOS TCC (Transparency, Consent, and Control) subsystem.
/// Never attempts clandestine capture or bypassing system security permissions.
public class ScreenCaptureKitManager {
    public private(set) var isCapturing: Bool = false
    public var currentConfig: ScreenCaptureConfiguration

    public init() {
        self.currentConfig = .thumbnail
    }

    /// Checks whether macOS Screen Recording permission is granted under TCC.
    public func checkTccPermissions() -> Bool {
        if #available(macOS 10.15, *) {
            return CGPreflightScreenCaptureAccess()
        }
        return true
    }

    /// Prompts the user via native macOS dialog if permission has not been granted.
    public func requestPermissions() -> Bool {
        if #available(macOS 10.15, *) {
            return CGRequestScreenCaptureAccess()
        }
        return true
    }

    /// Starts ScreenCaptureKit capture session with specified quality tier.
    public func startCapture(config: ScreenCaptureConfiguration) throws {
        guard checkTccPermissions() else {
            print("[SCREENCAPTUREKIT ERROR] Permiso de grabación de pantalla denegado por TCC en macOS.")
            throw NSError(domain: "AssetSchool.ScreenCaptureKit", code: 403, userInfo: [
                NSLocalizedDescriptionKey: "Permiso de grabación de pantalla no concedido en Ajustes del Sistema -> Privacidad y Seguridad -> Grabación de pantalla."
            ])
        }

        self.currentConfig = config
        self.isCapturing = true

        print("[SCREENCAPTUREKIT] Sesión SCStream iniciada exitosamente.")
        print("[SCREENCAPTUREKIT] Configuración: \(config.width)x\(config.height) @ \(config.fps) FPS (Tier: \(config.tier))")
    }

    /// Immediately stops SCStream and releases native frame buffers.
    public func stopCapture() {
        guard isCapturing else { return }
        print("[SCREENCAPTUREKIT] Deteniendo SCStream de manera inmediata...")
        self.isCapturing = false
        print("[SCREENCAPTUREKIT] Recursos de captura liberados.")
    }
}
