#!/usr/bin/env node
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const API_BASE = process.env.ASSETSCHOOL_SERVER_URL || 'http://127.0.0.1:3000';

function getAdminToken() {
  if (process.env.ASSETSCHOOL_ADMIN_TOKEN) return process.env.ASSETSCHOOL_ADMIN_TOKEN;
  try {
    const envPaths = [
      path.resolve(process.cwd(), '.env.local'),
      path.resolve(process.cwd(), '..', '..', '.env.local'),
      path.resolve(process.cwd(), '.env'),
    ];
    let jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      for (const p of envPaths) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          const m = content.match(/JWT_SECRET=([^\r\n]+)/);
          if (m) {
            jwtSecret = m[1].trim();
            break;
          }
        }
      }
    }
    if (jwtSecret) {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({
        sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        email: 'admin@assetschool.lan',
        role: 'SUPERADMIN',
        type: 'access',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        iat: now,
        exp: now + 3600,
      })).toString('base64url');
      const sig = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
      return `${header}.${payload}.${sig}`;
    }
  } catch {}
  return null;
}

function httpRequest(urlStr, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (postData) {
      if (!reqOptions.headers['Content-Type']) {
        reqOptions.headers['Content-Type'] = 'application/json';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  console.log('='.repeat(75));
  console.log('  AssetSchool Server — Utilidad de Administración de Servicio Independiente');
  console.log('='.repeat(75));

  try {
    switch (command) {
      case 'status': {
        console.log(`[CTL] Consultando diagnóstico en ${API_BASE}/api/v1/health...`);
        const res = await httpRequest(`${API_BASE}/api/v1/health`);
        if (res.status === 200) {
          const h = res.data;
          console.log('\nESTADO GENERAL DEL SERVIDOR:');
          console.log(`  Identificador:    ${h.serverId}`);
          console.log(`  Modalidad:        ${(h.serverMode || 'local').toUpperCase()}`);
          console.log(`  Estado General:   ${h.status === 'ok' ? '🟢 OPERATIVO' : '🟡 DEGRADADO'}`);
          console.log(`  Tiempo en Línea:  ${h.uptimeSeconds} segundos`);
          console.log(`  Agentes Activos:  ${h.connections?.connectedAgents ?? 0}`);
          console.log(`  Docentes Activos: ${h.connections?.connectedTeachers ?? 0}`);
          console.log(`  Timestamp:        ${h.timestamp}\n`);
        } else {
          console.error(`Servidor respondió con código ${res.status}:`, res.data || res.raw);
        }
        break;
      }

      case 'backup': {
        console.log(`[CTL] Solicitando respaldo de base de datos a ${API_BASE}...`);
        const token = getAdminToken();
        const res = await httpRequest(
          `${API_BASE}/api/v1/admin/backup`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
          JSON.stringify({ label: 'cli_manual' })
        );
        console.log('Respuesta:', res.data);
        break;
      }

      case 'export-migration': {
        console.log('[CTL] Exportando paquete de migración integral...');
        const token = getAdminToken();
        const res = await httpRequest(
          `${API_BASE}/api/v1/admin/export-bundle`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        if (res.data?.success && res.data?.packageJson) {
          const outPath = path.resolve(process.cwd(), 'assetschool_migration_export.json');
          fs.writeFileSync(outPath, res.data.packageJson, 'utf8');
          console.log(`✓ Paquete de migración guardado en: ${outPath}`);
        } else {
          console.error('Fallo en exportación:', res.data);
        }
        break;
      }

      case 'import-migration': {
        const filePath = args[1];
        if (!filePath || !fs.existsSync(filePath)) {
          console.error('Uso: assetschool-server-ctl import-migration <ruta_del_archivo.json>');
          process.exit(1);
        }
        console.log(`[CTL] Importando paquete de migración desde: ${filePath}...`);
        const json = fs.readFileSync(filePath, 'utf8');
        const token = getAdminToken();
        const res = await httpRequest(
          `${API_BASE}/api/v1/admin/import-bundle`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
          JSON.stringify({ packageJson: json })
        );
        console.log('Resultado:', res.data);
        break;
      }

      default:
        console.log(`Comando '${command}' no reconocido. Comandos disponibles:`);
        console.log('  status             Muestra el diagnóstico y estado en vivo del servidor.');
        console.log('  backup             Genera un respaldo de la base de datos.');
        console.log('  export-migration   Genera un paquete para migrar a servidor dedicado.');
        console.log('  import-migration   Importa un paquete de migración.');
        break;
    }
  } catch (err) {
    console.error(`Error conectando con AssetSchool Server en ${API_BASE}: ${err.message}`);
    process.exit(1);
  }
}

main();
