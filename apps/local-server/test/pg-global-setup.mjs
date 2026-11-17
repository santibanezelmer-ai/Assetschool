// R0 — real PostgreSQL 16 for integration tests (embedded-postgres).
// Starts an ephemeral cluster in a temp dir on a free port, applies the real
// migrations 001-003 and exposes the connection through env vars.
// It never touches the developer cluster on 5432.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../../infrastructure/postgres/migrations');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export default async function globalSetup() {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assetschool-r0-pg-'));
  const user = 'assetschool_admin';
  const password = randomBytes(18).toString('base64url');
  const database = 'assetschool_r0_test';

  const cluster = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    persistent: false,
    onLog: () => {},
  });
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(database);

  const client = new pg.Client({ host: '127.0.0.1', port, user, password, database });
  await client.connect();
  for (const file of ['001_initial_schema.sql', '002_seed_data.sql', '003_auth_security_enhancement.sql']) {
    await client.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  const version = (await client.query('SELECT version()')).rows[0].version;
  await client.end();

  process.env.DATABASE_HOST = '127.0.0.1';
  process.env.DATABASE_PORT = String(port);
  process.env.DATABASE_USER = user;
  process.env.DATABASE_PASSWORD = password;
  process.env.DATABASE_NAME = database;
  delete process.env.DATABASE_MODE;
  process.env.R0_PG_VERSION = version;

  globalThis.__ASSETSCHOOL_R0_PG__ = { cluster, dataDir };
  console.log(`\n[R0 PG] ${version.split(' on ')[0]} en 127.0.0.1:${port} (${dataDir})`);
}
