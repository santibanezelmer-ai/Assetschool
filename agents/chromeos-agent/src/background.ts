/**
 * AssetSchool ChromeOS Agent (Manifest V3 Service Worker)
 * Declara con estricta veracidad lo que ChromeOS permite dentro del Sandbox de Extensiones.
 * Fase 02: Integración de chrome.desktopCapture autorizada y WebRTC LAN.
 */

import { ChromeOsCaptureManager } from './capture';

export interface ChromeOsCapabilities {
  deviceId: string;
  osType: 'chromeos';
  canScreenBroadcast: boolean;
  canScreenReceive: boolean;
  canRemoteInput: boolean;
  canLockInput: boolean;
  canBlackoutScreen: boolean;
  canFileTransfer: boolean;
  canProcessBlock: boolean;
  canUrlBlock: boolean;
  canChat: boolean;
  canExecuteCommand: boolean;
  canCollectHardwareInventory: boolean;
  platformNotes: string;
}

export function getChromeOsCapabilities(deviceId: string): ChromeOsCapabilities {
  return {
    deviceId,
    osType: 'chromeos',
    canScreenBroadcast: true, // Con permiso explícito de usuario o política administrada AutoSelectDesktopCaptureSourceByScreen
    canScreenReceive: true,
    canRemoteInput: false,      // Imposible en sandbox de Chrome
    canLockInput: false,        // Imposible en sandbox de Chrome
    canBlackoutScreen: false,   // No puede ocultar la barra de sistema de ChromeOS
    canFileTransfer: false,     // Solo descargas estándar a la carpeta Downloads
    canProcessBlock: false,     // Las extensiones no gestionan procesos del sistema operativo
    canUrlBlock: true,          // declarativeNetRequest permite bloquear dominios en el navegador
    canChat: true,              // Interfaz web de mensajería para asistencia
    canExecuteCommand: false,   // No hay acceso a shell/crosh
    canCollectHardwareInventory: false,
    platformNotes: 'ChromeOS Extension MV3. Captura vía chrome.desktopCapture (requiere pre-autorización o política de dominio).',
  };
}

const captureManager = new ChromeOsCaptureManager();

console.log('[AssetSchool] Agente ChromeOS inicializado. Soporte de chrome.desktopCapture y WebRTC LAN activo.');
