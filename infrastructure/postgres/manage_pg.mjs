import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PG_DIR = path.resolve(__dirname, 'data');
const PORT = Number(process.env.DATABASE_PORT) || 5432;
const USER = process.env.DATABASE_USER || 'assetschool_admin';
const PASSWORD = process.env.DATABASE_PASSWORD || 'assetschool_secure_pass_2026';
const DATABASE = process.env.DATABASE_NAME || 'assetschool_db';

export function getPgInstance() {
  return new EmbeddedPostgres({
    port: PORT,
    databaseDir: PG_DIR,
    user: USER,
    password: PASSWORD,
    autoRehydrateSymlinks: true,
  });
}

export async function runMigrations() {
  const client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
  });

  await client.connect();
  console.log(`[Migrator] Conectado a ${DATABASE} en 127.0.0.1:${PORT}`);

  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = ['001_initial_schema.sql', '002_seed_data.sql', '003_auth_security_enhancement.sql'];

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`[Migrator] Aplicando migración: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`[Migrator] ✓ Migración ${file} completada con éxito.`);
    }
  }

  // Verificación de tablas
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log(`[Migrator] Tablas en 'public' (${res.rows.length}):`);
  res.rows.forEach(r => console.log(`  - ${r.table_name}`));

  await client.end();
}

async function main() {
  const action = process.argv[2] || 'status';
  const pg = getPgInstance();

  if (action === 'init') {
    if (!fs.existsSync(PG_DIR)) {
      console.log(`[PG-Manager] Inicializando cluster PostgreSQL 16 en: ${PG_DIR}`);
      await pg.initialise();
      console.log(`[PG-Manager] Cluster inicializado. Creando base de datos ${DATABASE}...`);
      await pg.start();
      await pg.createDatabase(DATABASE);
      await pg.stop();
      console.log(`[PG-Manager] Base de datos ${DATABASE} lista.`);
    } else {
      console.log(`[PG-Manager] Cluster ya existe en: ${PG_DIR}`);
    }
  } else if (action === 'start') {
    console.log(`[PG-Manager] Iniciando PostgreSQL 16 en 127.0.0.1:${PORT}...`);
    if (!fs.existsSync(PG_DIR)) {
      await pg.initialise();
    }
    await pg.start();
    try {
      await pg.createDatabase(DATABASE);
    } catch (e) {
      // Ignorar si ya existe
    }
    console.log(`[PG-Manager] PostgreSQL 16 OPERATIVO en 127.0.0.1:${PORT}`);
    // Mantener proceso vivo para que no se apague si se ejecuta como daemon
    process.stdin.resume();
  } else if (action === 'stop') {
    console.log(`[PG-Manager] Deteniendo PostgreSQL 16...`);
    await pg.stop();
    console.log(`[PG-Manager] PostgreSQL detenido.`);
  } else if (action === 'migrate') {
    await runMigrations();
  } else if (action === 'status') {
    try {
      const client = new Client({
        host: '127.0.0.1',
        port: PORT,
        user: USER,
        password: PASSWORD,
        database: DATABASE,
      });
      await client.connect();
      const res = await client.query('SELECT version(), NOW() as now');
      console.log('[PG-Manager] Estado: ACTIVO');
      console.log('Versión:', res.rows[0].version);
      console.log('Hora DB:', res.rows[0].now);
      await client.end();
    } catch (err) {
      console.log('[PG-Manager] Estado: INACTIVO (' + err.message + ')');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[PG-Manager Error]:', err);
    process.exit(1);
  });
}
