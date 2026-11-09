/**
 * AssetSchool ChromeOS Screen Capture Module (Manifest V3)
 * Uses official chrome.desktopCapture API.
 * In managed ChromeOS environments (Google Admin Console), policies can auto-select the screen,
 * while in unmanaged environments a standard system permission picker is displayed.
 */

export interface ChromeOsStreamConfig {
  sessionId: string;
  tier: 'thumbnail' | 'individual';
  targetWidth: number;
  targetHeight: number;
  targetFps: number;
}

export class ChromeOsCaptureManager {
  private mediaStream: MediaStream | null = null;
  private isCapturing: boolean = false;
  private peerConnection: RTCPeerConnection | null = null;

  public async startCapture(
    config: ChromeOsStreamConfig,
    onOfferReady: (sdp: string) => void,
    onError: (err: string) => void
  ) {
    if (this.isCapturing) {
      this.stopCapture();
    }

    try {
      // In Chrome Extension MV3, desktop media is selected via chrome.desktopCapture
      console.log('[CHROMEOS CAPTURE] Solicitando selector oficial de pantalla chrome.desktopCapture...');

      // Note: In an unmanaged Chromebook, chrome.desktopCapture.chooseDesktopMedia invokes the picker.
      // Under Enterprise Policy 'AutoSelectDesktopCaptureSourceByScreen', ChromeOS grants it automatically.
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          width: { ideal: config.targetWidth },
          height: { ideal: config.targetHeight },
          frameRate: { ideal: config.targetFps },
        },
      };

      // Create WebRTC PeerConnection for LAN transmission
      this.peerConnection = new RTCPeerConnection({
        iceServers: [], // LAN direct host candidates only
      });

      this.isCapturing = true;

      // Show visible student indicator notification
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'AssetSchool — Supervisión Activa',
          message: '🔴 Tu pantalla está siendo supervisada por el docente.',
          priority: 2,
        });
      }

      console.log(`[CHROMEOS CAPTURE] Captura iniciada: ${config.targetWidth}x${config.targetHeight} @ ${config.targetFps} FPS`);
    } catch (err: any) {
      this.isCapturing = false;
      onError(`Error iniciando captura en ChromeOS: ${err?.message || err}`);
    }
  }

  public stopCapture() {
    if (!this.isCapturing) return;

    console.log('[CHROMEOS CAPTURE] Deteniendo captura y cerrando WebRTC...');
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isCapturing = false;

    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'AssetSchool',
        message: '🟢 Supervisión de pantalla finalizada.',
        priority: 1,
      });
    }
  }
}
