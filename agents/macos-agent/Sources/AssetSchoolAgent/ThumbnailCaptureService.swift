import Foundation
import AppKit
import ScreenCaptureKit

/// Native macOS ScreenCaptureKit Thumbnail Generator.
/// Periodically captures lightweight 480x270 JPEG snapshots of the primary display
/// and transmits them to the local server for the teacher's classroom grid view.
public final class ThumbnailCaptureService {
    public static let shared = ThumbnailCaptureService()

    private var captureTimer: Timer?
    public var onThumbnailGenerated: (@Sendable (String) -> Void)?
    public private(set) var isRunning: Bool = false
    private var isCapturingFrame: Bool = false

    public init() {}

    public func start(intervalSeconds: TimeInterval = 3.0) {
        guard !isRunning else { return }
        self.isRunning = true
        print("[THUMBNAIL SERVICE] Iniciando generador periódico de miniaturas (\(intervalSeconds)s)...")

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.captureTimer?.invalidate()
            self.captureTimer = Timer.scheduledTimer(withTimeInterval: intervalSeconds, repeats: true) { [weak self] _ in
                self?.captureCurrentScreen()
            }
            // Trigger first capture immediately
            self.captureCurrentScreen()
        }
    }

    public func stop() {
        guard isRunning else { return }
        self.isRunning = false
        DispatchQueue.main.async { [weak self] in
            self?.captureTimer?.invalidate()
            self?.captureTimer = nil
        }
        print("[THUMBNAIL SERVICE] Generador de miniaturas detenido.")
    }

    public func captureCurrentScreen() {
        guard isRunning, !isCapturingFrame else { return }
        self.isCapturingFrame = true

        Task { [weak self] in
            defer { self?.isCapturingFrame = false }
            guard let self = self, self.isRunning else { return }

            if #available(macOS 14.0, *) {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                    guard let display = content.displays.first else { return }

                    let filter = SCContentFilter(display: display, excludingWindows: [])
                    let config = SCStreamConfiguration()
                    config.width = 480
                    config.height = 270
                    config.showsCursor = true

                    let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
                    let rep = NSBitmapImageRep(cgImage: cgImage)
                    if let jpgData = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.55]) {
                        let base64 = jpgData.base64EncodedString()
                        self.onThumbnailGenerated?(base64)
                    }
                } catch {
                    // TCC permission not yet granted or display locked
                }
            }
        }
    }
}
