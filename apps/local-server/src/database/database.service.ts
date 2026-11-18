import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseHealth {
  connected: boolean;
  engine: 'postgresql' | 'memory_test';
  host?: string;
  database?: string;
  lastCheckedAt: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: any = null;
  private isConnected = false;
  private engineMode: 'postgresql' | 'memory_test' = 'postgresql';

  async onModuleInit() {
    const isTestExplicit =
      process.env.DATABASE_MODE === 'memory_test_only' ||
      (process.env.NODE_ENV === 'test' && !process.env.DATABASE_HOST);

    if (isTestExplicit) {
      this.engineMode = 'memory_test';
      this.logger.warn(
        'Iniciando en modo EXPLICITO DE PRUEBAS EN MEMORIA (DATABASE_MODE=memory_test_only).',
      );
      await this.initMemoryTestDb();
      this.isConnected = true;
      return;
    }

    // Production / Standard Development mode: STRICT POSTGRESQL ENFORCEMENT
    const host = process.env.DATABASE_HOST || 'localhost';
    const port = Number(process.env.DATABASE_PORT) || 5432;
    const user = process.env.DATABASE_USER || 'assetschool_admin';
    const database = process.env.DATABASE_NAME || 'assetschool_db';

    // R0 / S7: the database password has no hardcoded default.
    const password = process.env.DATABASE_PASSWORD;
    if (!password) {
      this.isConnected = false;
      this.pool = null;
      this.logger.error(
        `[FATAL] DATABASE_PASSWORD no está definida. AssetSchool no usa contraseñas por defecto. ` +
          `Genere un entorno local con 'npm run env:dev' o defina la variable. ` +
          `Las operaciones que requieran persistencia serán rechazadas con 503.`,
      );
      return;
    }

    this.logger.log(
      `Conectando a PostgreSQL en ${host}:${port}/${database}...`,
    );

    try {
      this.pool = new Pool({
        host,
        port,
        user,
        password,
        database,
        connectionTimeoutMillis: 3000,
      });

      const client = await this.pool.connect();
      const res = await client.query('SELECT NOW() as now, version() as version');
      client.release();

      this.isConnected = true;
      this.engineMode = 'postgresql';
      this.logger.log(
        `[PostgreSQL CONECTADO]: ${res.rows[0].version.split(' on ')[0]} (${host}:${port}/${database})`,
      );
    } catch (err: any) {
      this.isConnected = false;
      this.pool = null;
      this.logger.error(
        `========================================================================\n` +
          `[FATAL] Error crítico: No se pudo conectar a PostgreSQL en ${host}:${port}/${database}.\n` +
          `Motivo: ${err.message}\n` +
          `Por política de seguridad y consistencia de datos, el servidor NO utilizará\n` +
          `fallback silencioso en memoria. Las operaciones que requieran persistencia\n` +
          `serán rechazadas con código 503 Service Unavailable.\n` +
          `========================================================================`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.pool && typeof this.pool.end === 'function') {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
    }
  }

  get isDatabaseReady(): boolean {
    return this.isConnected;
  }

  get engine(): 'postgresql' | 'memory_test' {
    return this.engineMode;
  }

  getHealth(): DatabaseHealth {
    return {
      connected: this.isConnected,
      engine: this.engineMode,
      host: process.env.DATABASE_HOST || 'localhost',
      database: process.env.DATABASE_NAME || 'assetschool_db',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async query<T extends QueryResultRow = any>(
    sql: string,
    params: any[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.isConnected || !this.pool) {
      throw new ServiceUnavailableException(
        'Base de datos PostgreSQL no disponible. Operación rechazada para prevenir inconsistencia y pérdida de datos.',
      );
    }

    return this.pool.query(sql, params);
  }

  public getPool(): any {
    return this.pool;
  }

  /**
   * Inicializa pg-mem exclusivamente para pruebas automatizadas unitarias/e2e.
   * Ejecuta el esquema real 001_initial_schema.sql y 002_seed_data.sql.
   */
  private async initMemoryTestDb() {
    const { newDb } = require('pg-mem');
    const db = newDb();

    db.registerExtension('pgcrypto', (schema: any) => {
      schema.registerFunction({
        name: 'gen_random_uuid',
        returns: db.public.getType('uuid'),
        impure: true,
        implementation: () => require('crypto').randomUUID(),
      });
    });

    const Pool = db.adapters.createPg().Pool;
    this.pool = new Pool();

    const rootDir = path.resolve(__dirname, '../../../../');
    const schemaPath = path.join(
      rootDir,
      'infrastructure/postgres/migrations/001_initial_schema.sql',
    );
    const seedPath = path.join(
      rootDir,
      'infrastructure/postgres/migrations/002_seed_data.sql',
    );

    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await this.pool.query(schemaSql);
    }

    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await this.pool.query(seedSql);
    }

    this.logger.log('Esquema relacional y datos de semilla cargados en pg-mem para pruebas.');
  }
}
