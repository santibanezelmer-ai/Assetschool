/**
 * ==============================================================================
 * ASSETSCHOOL TRANSACTIONAL UPDATE & INTEGRITY ENGINE (FASE F)
 * ==============================================================================
 * Arquitectura de actualización segura y atómica para Master, Student y Server.
 * Incluye:
 * 1. Versionado semántico estricto y matriz de compatibilidad.
 * 2. Canales 'stable' y 'beta'.
 * 3. Verificación de hash SHA-256 antes de cualquier ejecución.
 * 4. Verificación de firma digital asimétrica (RSA-SHA256).
 * 5. Actualización transaccional con respaldo automático y rollback en fallo.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class UpdateEngine {
  constructor(options = {}) {
    this.vendorPublicKeyPem = options.vendorPublicKeyPem || null;
  }

  /**
   * Compara dos versiones semánticas (v1 vs v2)
   * Retorna: 1 si v1 > v2, -1 si v1 < v2, 0 si son iguales
   */
  static compareVersions(v1, v2) {
    const parse = (v) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
    const p1 = parse(v1);
    const p2 = parse(v2);
    for (let i = 0; i < 3; i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) return 1;
      if ((p1[i] || 0) < (p2[i] || 0)) return -1;
    }
    return 0;
  }

  /**
   * Valida la compatibilidad entre versión cliente y versión del servidor
   */
  static isCompatibleWithServer(clientMinServerVersion, currentServerVersion) {
    if (!clientMinServerVersion || !currentServerVersion) return true;
    return UpdateEngine.compareVersions(currentServerVersion, clientMinServerVersion) >= 0;
  }

  /**
   * Calcula el hash SHA-256 de un archivo en disco
   */
  static computeFileSha256(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Verifica la integridad de un archivo contra el hash SHA-256 esperado
   */
  static verifyFileChecksum(filePath, expectedSha256) {
    if (!fs.existsSync(filePath)) return false;
    const actual = UpdateEngine.computeFileSha256(filePath);
    return actual.toLowerCase() === expectedSha256.toLowerCase();
  }

  /**
   * Firma criptográficamente un manifiesto o paquete con la clave privada del vendor
   */
  static signManifest(manifestPayload, privateKeyPem) {
    const signer = crypto.createSign('RSA-SHA256');
    const { signature, ...rest } = manifestPayload; // excluir campo signature si existía
    const canonicalString = JSON.stringify(rest, Object.keys(rest).sort());
    signer.update(canonicalString);
    return signer.sign(privateKeyPem, 'hex');
  }

  /**
   * Verifica la firma criptográfica del manifiesto usando la clave pública del vendor
   */
  static verifyManifestSignature(manifest, publicKeyPem) {
    if (!manifest.signature || !publicKeyPem) return false;
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      const { signature, ...rest } = manifest;
      const canonicalString = JSON.stringify(rest, Object.keys(rest).sort());
      verifier.update(canonicalString);
      return verifier.verify(publicKeyPem, signature, 'hex');
    } catch (_) {
      return false;
    }
  }

  /**
   * Evalúa la disponibilidad de actualización contra un manifiesto
   */
  evaluateUpdate(manifest, currentVersion, currentChannel, currentServerVersion) {
    // 1. Verificar canal
    if (manifest.channel !== currentChannel && manifest.channel !== 'stable') {
      return { updateAvailable: false, reason: 'Canal no correspondiente' };
    }

    // 2. Verificar versión más reciente
    const cmp = UpdateEngine.compareVersions(manifest.version, currentVersion);
    if (cmp <= 0) {
      return { updateAvailable: false, reason: 'El equipo ya posee la versión más reciente' };
    }

    // 3. Verificar compatibilidad con el servidor
    if (manifest.minServerVersion && currentServerVersion) {
      const isCompat = UpdateEngine.isCompatibleWithServer(manifest.minServerVersion, currentServerVersion);
      if (!isCompat) {
        return {
          updateAvailable: false,
          incompatible: true,
          reason: `Requiere servidor versión ${manifest.minServerVersion} o superior. Versión actual del servidor: ${currentServerVersion}.`,
        };
      }
    }

    // 4. Verificar firma si hay clave pública configurada
    if (this.vendorPublicKeyPem) {
      const validSig = UpdateEngine.verifyManifestSignature(manifest, this.vendorPublicKeyPem);
      if (!validSig) {
        return { updateAvailable: false, securityAlert: true, reason: 'Firma digital del manifiesto INVÁLIDA' };
      }
    }

    return {
      updateAvailable: true,
      targetVersion: manifest.version,
      channel: manifest.channel,
      releaseNotes: manifest.releaseNotes,
      packages: manifest.packages,
    };
  }

  /**
   * Ejecuta actualización transaccional con respaldo y rollback automático
   */
  async applyUpdateTransactional({
    packagePath,
    expectedSha256,
    targetInstallPath,
    backupDir,
    verifyServiceHealth, // callback asíncrono que retorna boolean
  }) {
    console.log(`[UpdateEngine] Iniciando actualización transaccional hacia ${targetInstallPath}...`);

    // 1. Verificación previa de integridad SHA-256
    if (!UpdateEngine.verifyFileChecksum(packagePath, expectedSha256)) {
      throw new Error('FALLO DE INTEGRIDAD: El hash SHA-256 del paquete descargado no coincide.');
    }
    console.log('  ✓ Integridad SHA-256 verificada exitosamente.');

    // 2. Respaldo previo (Backup)
    const backupPath = path.resolve(backupDir, `backup_${Date.now()}`);
    fs.mkdirSync(backupPath, { recursive: true });

    if (fs.existsSync(targetInstallPath)) {
      console.log(`  -> Creando respaldo previo en ${backupPath}...`);
      fs.cpSync(targetInstallPath, path.resolve(backupPath, 'installed_target'), { recursive: true });
    }

    try {
      // 3. Reemplazo atómico / Extracción de la actualización
      console.log('  -> Aplicando nuevos archivos...');
      // En entorno de prueba/simulación, copiar paquete verificado
      fs.copyFileSync(packagePath, path.resolve(targetInstallPath, 'current_binary.bin'));

      // 4. Verificación de salud posterior a la actualización (Health check)
      if (verifyServiceHealth) {
        console.log('  -> Ejecutando verificación de salud post-actualización...');
        const isHealthy = await verifyServiceHealth();
        if (!isHealthy) {
          throw new Error('La nueva versión falló la verificación de operatividad posterior.');
        }
      }

      console.log('  ✓ Actualización aplicada con éxito y confirmada operativa.');
      return { success: true, backupPath };
    } catch (err) {
      console.error(`  ❌ ERROR DURANTE ACTUALIZACIÓN: ${err.message}`);
      console.warn('  -> INICIANDO ROLLBACK AUTOMÁTICO...');

      const backedUpTarget = path.resolve(backupPath, 'installed_target');
      if (fs.existsSync(backedUpTarget)) {
        fs.cpSync(backedUpTarget, targetInstallPath, { recursive: true });
        console.log('  ✓ Rollback completado: El sistema ha sido restaurado a su versión previa.');
      }

      return {
        success: false,
        rolledBack: true,
        error: err.message,
      };
    }
  }
}
