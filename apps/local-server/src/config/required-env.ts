import * as fs from 'fs';
import * as path from 'path';

/**
 * R0 / S7: secrets must come from the environment. There are no hardcoded
 * fallbacks: a missing secret is a startup error, never a silent default.
 */
export class MissingSecretError extends Error {
  constructor(public readonly variable: string) {
    super(
      `Variable de entorno obligatoria '${variable}' no definida. ` +
        `Genere un entorno local con 'npm run env:dev' (crea .env.local) ` +
        `o defina la variable en el servicio. AssetSchool no usa secretos por defecto.`,
    );
    this.name = 'MissingSecretError';
  }
}

const MIN_JWT_SECRET_LENGTH = 32;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new MissingSecretError(name);
  }
  return value;
}

export function requireJwtSecret(): string {
  const secret = requireEnv('JWT_SECRET');
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres (tiene ${secret.length}).`,
    );
  }
  return secret;
}

/**
 * Loads KEY=VALUE pairs from a local env file without overriding variables
 * that are already set in the process environment. Returns the file used.
 */
export function loadLocalEnvFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) continue;

    const content = fs.readFileSync(resolved, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return resolved;
  }
  return null;
}
