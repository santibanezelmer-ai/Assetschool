import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class LicensingService {
  private readonly licensePath: string;
  private vendorPublicKeyPem: string;

  constructor(private readonly db: DatabaseService) {
    const configDir = path.resolve(process.cwd(), '../../config');
    this.licensePath = path.resolve(configDir, 'license.aslic');

    // Cargar clave pública del vendor si existe
    const pubKeyPath = path.resolve(configDir, 'vendor/assetschool-vendor.pub.pem');
    if (fs.existsSync(pubKeyPath)) {
      this.vendorPublicKeyPem = fs.readFileSync(pubKeyPath, 'utf8');
    } else {
      // Fallback: si no existe, generar par para pruebas
      const { publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.vendorPublicKeyPem = publicKey;
    }
  }

  setVendorPublicKey(pem: string) {
    this.vendorPublicKeyPem = pem;
  }

  async getLicenseStatus(institutionId?: string) {
    if (!fs.existsSync(this.licensePath)) {
      return {
        isLicensed: false,
        status: 'UNLICENSED',
        message: 'No hay licencia comercial instalada. El sistema opera en modo evaluación LAN básico.',
        maxDevices: 10,
        licensedModules: ['BASIC_LAN_MONITOR'],
      };
    }

    try {
      const raw = fs.readFileSync(this.licensePath, 'utf8');
      const license = JSON.parse(raw);

      // Contar dispositivos activos en la BD
      const devRes = await this.db.query(
        'SELECT count(*) AS count FROM devices WHERE is_revoked = false' +
          (institutionId ? ' AND institution_id = $1' : ''),
        institutionId ? [institutionId] : []
      );
      const activeDevices = parseInt(devRes.rows[0]?.count || '0', 10);

      // Validar firma
      const isValidSig = this.verifySignature(license);
      if (!isValidSig) {
        return {
          isLicensed: false,
          status: 'TAMPERED_SIGNATURE',
          message: 'La firma de la licencia es inválida. Posible manipulación del archivo.',
        };
      }

      // Validar expiración
      const now = Date.now();
      const expiry = new Date(license.validUntil).getTime();
      if (expiry <= now) {
        return {
          isLicensed: false,
          status: 'EXPIRED',
          message: `La licencia expiró el ${license.validUntil}.`,
          validUntil: license.validUntil,
        };
      }

      return {
        isLicensed: true,
        status: 'ACTIVE',
        edition: license.edition || 'COMMERCIAL_PROPRIETARY',
        institutionName: license.institutionName,
        rut: license.rut,
        licenseId: license.licenseId,
        maxDevices: license.maxDevices,
        activeDevices,
        remainingSlots: Math.max(0, license.maxDevices - activeDevices),
        validUntil: license.validUntil,
        licensedModules: license.licensedModules || [],
        daysRemaining: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)),
      };
    } catch (e: any) {
      return {
        isLicensed: false,
        status: 'CORRUPTED',
        message: `Error al leer licencia: ${e.message}`,
      };
    }
  }

  async activate(licenseData: any) {
    if (!licenseData || typeof licenseData !== 'object') {
      throw new BadRequestException('Se requiere un objeto de licencia válido');
    }

    const isValid = this.verifySignature(licenseData);
    if (!isValid) {
      throw new BadRequestException('Firma digital de la licencia INVÁLIDA. Verifique el emisor.');
    }

    const dir = path.dirname(this.licensePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.licensePath, JSON.stringify(licenseData, null, 2), 'utf8');

    return {
      success: true,
      message: 'Licencia institucional activada exitosamente.',
      licenseId: licenseData.licenseId,
      institutionName: licenseData.institutionName,
      maxDevices: licenseData.maxDevices,
      validUntil: licenseData.validUntil,
    };
  }

  private verifySignature(licenseObj: any): boolean {
    if (!licenseObj?.signature || !this.vendorPublicKeyPem) return false;
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
}
