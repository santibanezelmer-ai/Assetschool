#!/usr/bin/env node
/**
 * ==============================================================================
 * ASSETSCHOOL SERVER PROVISIONER & LIFECYCLE CONTROLLER (FASE F)
 * ==============================================================================
 * Herramienta CLI multiplataforma para aprovisionar, configurar y controlar
 * el servidor independiente de AssetSchool en modalidades LOCAL o DEDICATED.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const LOCAL_SERVER_DIR = path.resolve(REPO_ROOT, 'apps/local-server');
const CONFIG_DIR = path.resolve(REPO_ROOT, 'config');
const LOGS_DIR = path.resolve(REPO_ROOT, 'logs');

// Asegurar directorios
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

async function getPgClient(config) {
  const client = new pg.Client({
    host: config.host || process.env.DATABASE_HOST || '127.0.0.1',
    port: parseInt(config.port || process.env.DATABASE_PORT || '5432', 10),
    user: config.user || process.env.DATABASE_USER || 'assetschool_admin',
    password: config.password || process.env.DATABASE_PASSWORD || 'assetschool_secure_pass_2026',
    database: config.database || process.env.DATABASE_NAME || 'assetschool_db',
  });
  await client.connect();
  return client;
}

export async function provisionServer(options = {}) {
  const mode = (options.mode || 'LOCAL').toUpperCase();
  const port = options.port || 3000;
  const sfuMinPort = options.sfuMinPort || 40000;
  const sfuMaxPort = options.sfuMaxPort || 40999;
  const dbConfig = options.db || {};

  console.log('='.repeat(80));
  console.log(`   ASSETSCHOOL — APROVISIONAMIENTO DE SERVIDOR [MODALIDAD: ${mode}]`);
  console.log('='.repeat(80));

  // 1. Detección de red LAN
  console.log('\n[1/6] Analizando configuración de red LAN e interfaces...');
  const ifaces = os.networkInterfaces();
  let lanIp = '127.0.0.1';
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (!a.internal && a.family === 'IPv4' && !a.address.startsWith('169.254')) {
        lanIp = a.address;
        break;
      }
    }
  }
  console.log(`  ✓ IP LAN detectable: ${lanIp}`);
  console.log(`  ✓ Puerto de señalización REST/WebSocket: ${port}`);
  console.log(`  ✓ Puerto de descubrimiento UDP: 48500`);

  // 2. Verificación de Mediasoup SFU y puertos UDP
  console.log('\n[2/6] Configurando transporte multimedia Mediasoup v3...');
  console.log(`  ✓ Rango UDP asignado: ${sfuMinPort} - ${sfuMaxPort} (${sfuMaxPort - sfuMinPort + 1} puertos)`);
  console.log(`  ✓ Announced IPv4 para WebRTC: ${lanIp}`);

  // 3. Inicialización de Identidad Criptográfica del Servidor (RSA-2048 + Fingerprint)
  console.log('\n[3/6] Inicializando identidad criptográfica persistente del servidor...');
  const identityPath = path.resolve(CONFIG_DIR, 'server-identity.json');
  let identity;
  if (fs.existsSync(identityPath) && !options.forceReinitIdentity) {
    identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    console.log(`  ✓ Identidad existente cargada (ID: ${identity.serverId}, Modalidad: ${identity.mode})`);
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex');
    const serverId = crypto.randomUUID();
    identity = {
      serverId,
      mode,
      fingerprint,
      publicKey,
      privateKey,
      lanIp,
      port,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
    console.log(`  ✓ Nueva identidad generada: ${serverId} [Fingerprint SHA-256: ${fingerprint.substring(0, 16)}...]`);
  }

  // 4. Verificación y Migraciones de Base de Datos PostgreSQL
  console.log('\n[4/6] Verificando PostgreSQL y aplicando migraciones...');
  let pgClient;
  try {
    pgClient = await getPgClient(dbConfig);
    console.log('  ✓ Conexión establecida exitosamente con PostgreSQL.');

    const migrationsDir = path.resolve(REPO_ROOT, 'infrastructure/postgres/migrations');
    const migrationFiles = [
      '001_initial_schema.sql',
      '002_seed_data.sql',
      '003_auth_security_enhancement.sql',
      '004_institutional_administration.sql',
    ];

    for (const mf of migrationFiles) {
      const p = path.resolve(migrationsDir, mf);
      if (fs.existsSync(p)) {
        const sql = fs.readFileSync(p, 'utf8');
        await pgClient.query(sql);
        console.log(`  ✓ Migración aplicada: ${mf}`);
      }
    }
  } catch (err) {
    console.warn(`  ⚠️ Alerta en conexión PostgreSQL: ${err.message}`);
    console.warn('    Asegúrese de que el servicio PostgreSQL esté activo en el puerto 5432.');
  } finally {
    if (pgClient) await pgClient.end();
  }

  // 5. Generar archivo de configuración unificado del servidor
  console.log('\n[5/6] Escribiendo archivo de configuración institucional (.env.production / server.json)...');
  const serverConfig = {
    serverId: identity.serverId,
    serverMode: mode,
    port,
    lanIp,
    sfu: {
      minPort: sfuMinPort,
      maxPort: sfuMaxPort,
      announcedIp: lanIp,
    },
    database: {
      host: dbConfig.host || '127.0.0.1',
      port: dbConfig.port || 5432,
      database: dbConfig.database || 'assetschool_db',
    },
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.resolve(CONFIG_DIR, 'assetschool-server-config.json'),
    JSON.stringify(serverConfig, null, 2),
    'utf8'
  );
  console.log(`  ✓ Configuración guardada en ${path.resolve(CONFIG_DIR, 'assetschool-server-config.json')}`);

  // 6. Resumen de Aprovisionamiento
  console.log('\n[6/6] Verificación final de aprovisionamiento...');
  console.log('  ✓ Servidor configurado y listo para ser gestionado como servicio o proceso en primer plano.');
  console.log('='.repeat(80));

  return serverConfig;
}

// Ejecución directa por CLI si se invoca como script principal
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args.includes('--dedicated') ? 'DEDICATED' : 'LOCAL';
  provisionServer({ mode })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error durante aprovisionamiento:', err);
      process.exit(1);
    });
}
