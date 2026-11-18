#!/usr/bin/env node
/**
 * Emisor de licencias comerciales propietarias para AssetSchool
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LicenseManager } from './license-manager.mjs';
import { getOrCreateVendorKeyPair } from './vendor-keys.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const KEYS_DIR = path.resolve(REPO_ROOT, 'config/vendor');

const { privateKeyPem, publicKeyPem } = getOrCreateVendorKeyPair(KEYS_DIR);

export function generateInstitutionalLicense(options = {}) {
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const licensePayload = {
    institutionId: options.institutionId || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    rut: options.rut || '76.123.456-7',
    institutionName: options.institutionName || 'Colegio Demo Bicentenario',
    maxDevices: options.maxDevices || 120,
    validUntil: options.validUntil || oneYearFromNow.toISOString(),
    licensedModules: options.licensedModules || [
      'SFU_BROADCAST',
      'REMOTE_INPUT',
      'FILE_TRANSFER',
      'WEB_FILTERING',
      'EXAM_MODE',
      'HARDWARE_INVENTORY',
    ],
    installationId: options.installationId || null,
  };

  const signedLicense = LicenseManager.issueLicense(licensePayload, privateKeyPem);
  return {
    license: signedLicense,
    publicKeyPem,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = generateInstitutionalLicense();
  const target = path.resolve(REPO_ROOT, 'config/license.aslic');
  fs.writeFileSync(target, JSON.stringify(out.license, null, 2), 'utf8');
  console.log('Licencia comercial emitida exitosamente en:', target);
}
