#!/usr/bin/env node
// =============================================================================
// AssetSchool — generador de entorno local de DESARROLLO (.env.local)
// R0 / S7: los secretos ya no existen en el código; este script los genera.
//
// Uso:
//   node scripts/generate-dev-env.mjs
//   node scripts/generate-dev-env.mjs --db-password '<contraseña del cluster existente>'
//
// Reglas:
//   - Nunca sobrescribe un .env.local existente (sale con error).
//   - JWT_SECRET siempre es aleatorio (48 bytes).
//   - DATABASE_PASSWORD es aleatoria salvo que el cluster local
//     (infrastructure/postgres/data) ya exista: en ese caso la contraseña del
//     cluster no se puede adivinar y debe pasarse con --db-password.
// =============================================================================
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env.local');
const pgDataDir = path.join(root, 'infrastructure', 'postgres', 'data');

if (fs.existsSync(target)) {
  console.error(`[env:dev] ${target} ya existe. No se sobrescribe. Bórrelo manualmente si quiere regenerarlo.`);
  process.exit(1);
}

const argIdx = process.argv.indexOf('--db-password');
let dbPassword = argIdx > -1 ? process.argv[argIdx + 1] : undefined;

if (!dbPassword) {
  if (fs.existsSync(pgDataDir)) {
    console.error(
      `[env:dev] Existe un cluster PostgreSQL local en ${pgDataDir}.\n` +
        `          Su contraseña no se puede generar: pásela con --db-password '<contraseña>'.\n` +
        `          (Después puede rotarla con ALTER USER y actualizar .env.local.)`,
    );
    process.exit(1);
  }
  dbPassword = randomBytes(24).toString('base64url');
}

const content = [
  '# AssetSchool — entorno local de DESARROLLO. Generado por scripts/generate-dev-env.mjs',
  '# No versionar. Ignorado por .gitignore.',
  `JWT_SECRET=${randomBytes(48).toString('base64url')}`,
  'JWT_EXPIRES_IN=8h',
  'DATABASE_HOST=127.0.0.1',
  'DATABASE_PORT=5432',
  'DATABASE_USER=assetschool_admin',
  `DATABASE_PASSWORD=${dbPassword}`,
  'DATABASE_NAME=assetschool_db',
  '',
].join('\n');

fs.writeFileSync(target, content, { mode: 0o600, flag: 'wx' });
console.log(`[env:dev] Creado ${target} (permisos 0600).`);
