import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type ServerOperatingMode = 'local' | 'dedicated';

export interface ServerIdentity {
  serverId: string;
  serverName: string;
  serverMode: ServerOperatingMode;
  institutionId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
  createdAt: string;
  version: string;
}

@Injectable()
export class ServerIdentityService implements OnModuleInit {
  private readonly logger = new Logger(ServerIdentityService.name);
  private identity!: ServerIdentity;
  private readonly identityDir = process.env.ASSETSCHOOL_CONFIG_DIR || path.resolve(process.cwd(), 'config');
  private readonly identityFilePath = path.join(this.identityDir, 'server-identity.json');

  onModuleInit() {
    this.loadOrCreateIdentity();
  }

  public getIdentity(): ServerIdentity {
    return this.identity;
  }

  public getServerId(): string {
    return this.identity.serverId;
  }

  public getServerMode(): ServerOperatingMode {
    return this.identity.serverMode;
  }

  public getFingerprint(): string {
    return this.identity.fingerprintSha256;
  }

  public getPublicKeyPem(): string {
    return this.identity.publicKeyPem;
  }

  public setServerMode(mode: ServerOperatingMode) {
    this.identity.serverMode = mode;
    this.saveIdentity();
    this.logger.log(`Modalidad del servidor actualizada a: ${mode.toUpperCase()}`);
  }

  public setInstitutionId(institutionId: string) {
    this.identity.institutionId = institutionId;
    this.saveIdentity();
  }

  public signPayload(data: string | Buffer): string {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(this.identity.privateKeyPem, 'base64');
  }

  public verifySignature(data: string | Buffer, signatureBase64: string, publicKeyPem?: string): boolean {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKeyPem || this.identity.publicKeyPem, signatureBase64, 'base64');
  }

  public exportBundle(): string {
    return JSON.stringify(this.identity, null, 2);
  }

  public importBundle(bundleJson: string): boolean {
    try {
      const parsed = JSON.parse(bundleJson) as ServerIdentity;
      if (!parsed.serverId || !parsed.publicKeyPem || !parsed.privateKeyPem) {
        throw new Error('Estructura de identidad de servidor inválida');
      }

      // Verify that public/private keys match
      const testData = 'AssetSchool_Key_Pair_Validation_' + Date.now();
      const sign = crypto.createSign('SHA256');
      sign.update(testData);
      sign.end();
      const sig = sign.sign(parsed.privateKeyPem, 'base64');

      const verify = crypto.createVerify('SHA256');
      verify.update(testData);
      verify.end();
      const isValid = verify.verify(parsed.publicKeyPem, sig, 'base64');
      if (!isValid) {
        throw new Error('El par de claves criptográficas no coincide');
      }

      this.identity = parsed;
      this.saveIdentity();
      this.logger.log(`Identidad del servidor importada exitosamente: ${this.identity.serverId} (${this.identity.fingerprintSha256.slice(0, 12)}...)`);
      return true;
    } catch (err: any) {
      this.logger.error(`Fallo al importar identidad de servidor: ${err.message}`);
      return false;
    }
  }

  private loadOrCreateIdentity() {
    if (!fs.existsSync(this.identityDir)) {
      fs.mkdirSync(this.identityDir, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(this.identityFilePath)) {
      try {
        const raw = fs.readFileSync(this.identityFilePath, 'utf8');
        this.identity = JSON.parse(raw);
        this.logger.log(`Identidad de servidor persistente cargada: ${this.identity.serverId}`);
        this.logger.log(`  Modalidad: ${this.identity.serverMode.toUpperCase()} | Fingerprint: ${this.identity.fingerprintSha256.slice(0, 16)}...`);
        return;
      } catch (err: any) {
        this.logger.warn(`Error leyendo archivo de identidad: ${err.message}. Regenerando par criptográfico seguro...`);
      }
    }

    // Generate new persistent Ed25519 or RSA-2048 keypair
    this.logger.log('Generando nueva identidad criptográfica institucional persistente...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const serverId = crypto.randomUUID();
    const fingerprintSha256 = crypto
      .createHash('sha256')
      .update(publicKey)
      .digest('hex');

    const defaultMode: ServerOperatingMode = (process.env.SERVER_MODE as ServerOperatingMode) || 'local';
    const defaultInst = process.env.INSTITUTION_ID || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    this.identity = {
      serverId,
      serverName: process.env.SERVER_NAME || `AssetSchool-Server-${serverId.slice(0, 8)}`,
      serverMode: defaultMode,
      institutionId: defaultInst,
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      fingerprintSha256,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };

    this.saveIdentity();
    this.logger.log(`Nueva identidad generada y guardada en ${this.identityFilePath}`);
    this.logger.log(`  Server ID: ${serverId}`);
    this.logger.log(`  SHA-256 Fingerprint: ${fingerprintSha256}`);
  }

  private saveIdentity() {
    try {
      fs.writeFileSync(this.identityFilePath, JSON.stringify(this.identity, null, 2), {
        encoding: 'utf8',
        mode: 0o600, // Restricted to owner
      });
    } catch (err: any) {
      this.logger.error(`No se pudo persistir la identidad del servidor: ${err.message}`);
    }
  }
}
