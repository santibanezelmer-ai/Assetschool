#!/usr/bin/env node
/**
 * Generador y firmador de manifiestos de actualización para AssetSchool
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UpdateEngine } from './update-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export function createSignedManifest({
  version = '1.2.1',
  channel = 'stable',
  minServerVersion = '1.0.0',
  releaseNotes = 'Actualización de seguridad y optimizaciones de transmisión WebRTC LAN.',
  packages = {},
  privateKeyPem,
}) {
  const manifestData = {
    version,
    channel,
    releaseDate: new Date().toISOString(),
    minServerVersion,
    releaseNotes,
    packages,
  };

  const signature = UpdateEngine.signManifest(manifestData, privateKeyPem);
  return {
    ...manifestData,
    signature,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Generador de manifiesto firmado de AssetSchool');
}
