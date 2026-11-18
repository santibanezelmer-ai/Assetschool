/**
 * ==============================================================================
 * ASSETSCHOOL PROPRIETARY COMMERCIAL LICENSING ENGINE (FASE F)
 * ==============================================================================
 * Motor de licenciamiento institucional autónomo para redes LAN sin conexión a Internet.
 * Valida firmas asimétricas RSA-SHA256, expiración, límites de puestos y módulos.
 * ==============================================================================
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class LicenseManager {
  constructor(vendorPublicKeyPem) {
    this.vendorPublicKeyPem = vendorPublicKeyPem;
  }

  /**
   * Genera un identificador de instalación persistente (Machine Fingerprint)
   * basado en hardware local (CPU, Interfaces de Red, Hostname)
   */
  static getInstallationHardwareId() {
    const cpus = os.cpus().map((c) => c.model).join('|');
    const ifaces = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map((i) => i.mac)
      .sort()
      .join('|');
    const raw = `${os.hostname()}|${os.platform()}|${cpus}|${ifaces}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32).toUpperCase();
  }

  /**
   * Emite y firma criptográficamente una licencia institucional propietaria
   */
  static issueLicense(licensePayload, vendorPrivateKeyPem) {
    const payload = {
      licenseId: licensePayload.licenseId || crypto.randomUUID(),
      institutionId: licensePayload.institutionId,
      rut: licensePayload.rut || 'N/A',
      institutionName: licensePayload.institutionName,
      edition: 'COMMERCIAL_PROPRIETARY',
      maxDevices: licensePayload.maxDevices || 50,
      validUntil: licensePayload.validUntil,
      licensedModules: licensePayload.licensedModules || [
        'SFU_BROADCAST',
        'REMOTE_INPUT',
        'FILE_TRANSFER',
        'WEB_FILTERING',
        'EXAM_MODE',
        'HARDWARE_INVENTORY',
      ],
      issuedAt: new Date().toISOString(),
      installationId: licensePayload.installationId || null, // null = cualquier instalación del colegio
    };

    const signer = crypto.createSign('RSA-SHA256');
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    signer.update(canonical);
    const signature = signer.sign(vendorPrivateKeyPem, 'hex');

    return {
      ...payload,
      signature,
    };
  }

  /**
   * Verifica la autenticidad e integridad criptográfica de la licencia
   */
  verifySignature(licenseObj) {
    if (!licenseObj || !licenseObj.signature || !this.vendorPublicKeyPem) {
      return false;
    }
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      const { signature, ...rest } = licenseObj;
      const canonical = JSON.stringify(rest, Object.keys(rest).sort());
      verifier.update(canonical);
      return verifier.verify(this.vendorPublicKeyPem, signature, 'hex');
    } catch (_) {
      return false;
    }
  }

  /**
   * Valida integralmente la licencia contra el entorno operativo del servidor
   */
  validateLicense(licenseObj, context = {}) {
    // 1. Verificación de firma criptográfica
    if (!this.verifySignature(licenseObj)) {
      return {
        isValid: false,
        error: 'FIRMA_INVALIDA',
        message: 'La firma criptográfica de la licencia es inválida o el archivo fue manipulado.',
      };
    }

    // 2. Verificación de vigencia / Expiración
    const now = Date.now();
    const expiryTime = new Date(licenseObj.validUntil).getTime();
    if (isNaN(expiryTime) || expiryTime <= now) {
      return {
        isValid: false,
        error: 'LICENCIA_EXPIRADA',
        message: `La licencia institucional expiró el ${licenseObj.validUntil}.`,
        validUntil: licenseObj.validUntil,
      };
    }

    // 3. Verificación de coincidencia institucional
    if (context.institutionId && licenseObj.institutionId !== context.institutionId) {
      return {
        isValid: false,
        error: 'INSTITUCION_NO_COINCIDE',
        message: 'La licencia no corresponde a la institución configurada en este servidor.',
      };
    }

    // 4. Verificación de límite de equipos registrados
    const currentDevices = context.registeredDeviceCount || 0;
    if (currentDevices > licenseObj.maxDevices) {
      return {
        isValid: false,
        error: 'LIMITE_EXCEDIDO',
        message: `Se ha excedido el cupo máximo de equipos autorizados (${currentDevices}/${licenseObj.maxDevices}).`,
        currentDevices,
        maxDevices: licenseObj.maxDevices,
      };
    }

    // 5. Verificación de instalación ligada (si la licencia especifica un hardwareId)
    if (licenseObj.installationId) {
      const currentHwId = LicenseManager.getInstallationHardwareId();
      if (licenseObj.installationId !== currentHwId) {
        return {
          isValid: false,
          error: 'HARDWARE_NO_COINCIDE',
          message: 'La licencia está vinculada a otro equipo físico o servidor.',
        };
      }
    }

    return {
      isValid: true,
      licenseId: licenseObj.licenseId,
      institutionName: licenseObj.institutionName,
      rut: licenseObj.rut,
      maxDevices: licenseObj.maxDevices,
      activeDevices: currentDevices,
      remainingSlots: licenseObj.maxDevices - currentDevices,
      validUntil: licenseObj.validUntil,
      licensedModules: licenseObj.licensedModules,
      daysRemaining: Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24)),
    };
  }

  /**
   * Guarda y activa el archivo de licencia en disco
   */
  activate(licenseObj, targetFilePath) {
    const val = this.validateLicense(licenseObj);
    if (!val.isValid && val.error === 'FIRMA_INVALIDA') {
      throw new Error(`Activación rechazada: ${val.message}`);
    }
    const dir = path.dirname(targetFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetFilePath, JSON.stringify(licenseObj, null, 2), 'utf8');
    return val;
  }

  /**
   * Desactiva y elimina el archivo de licencia
   */
  deactivate(targetFilePath) {
    if (fs.existsSync(targetFilePath)) {
      fs.unlinkSync(targetFilePath);
      return { success: true, message: 'Licencia desactivada exitosamente.' };
    }
    return { success: false, message: 'No se encontró un archivo de licencia activo.' };
  }
}
