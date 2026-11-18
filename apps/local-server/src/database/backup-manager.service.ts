import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseService } from './database.service';
import { ServerIdentityService } from '../identity/server-identity.service';

export interface DatabaseBackupManifest {
  backupId: string;
  createdAt: string;
  serverVersion: string;
  sourceServerId: string;
  sha256Checksum: string;
  tableCount: number;
  totalRecords: number;
  tables: Record<string, any[]>;
}

export interface MigrationPackage {
  packageId: string;
  exportedAt: string;
  serverIdentity: any;
  databaseBackup: DatabaseBackupManifest;
  signature: string;
}

@Injectable()
export class BackupManagerService {
  private readonly logger = new Logger(BackupManagerService.name);
  private readonly backupDir = path.resolve(process.cwd(), 'backups');

  private readonly orderedTables = [
    'institutions',
    'roles',
    'users',
    'courses',
    'classrooms',
    'students',
    'devices',
    'device_agents',
    'device_capabilities',
    'classroom_sessions',
    'device_sessions',
    'commands',
    'audit_logs',
    'assessments',
    'questions',
    'assessment_results',
    'policies',
    'application_inventory',
    'files',
  ];

  constructor(
    private readonly db: DatabaseService,
    private readonly identityService: ServerIdentityService,
  ) {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true, mode: 0o750 });
    }
  }

  public async createBackup(label?: string): Promise<{
    success: boolean;
    backupId?: string;
    backupPath?: string;
    sha256?: string;
    totalRecords?: number;
    tableCount?: number;
    recordCounts?: { users: number; classrooms: number; devices: number };
    error?: string;
  }> {
    try {
      this.logger.log(`Iniciando respaldo de base de datos PostgreSQL (${label || 'manual'})...`);
      const backupId = crypto.randomUUID();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `assetschool_backup_${timestamp}.json`;
      const filePath = path.join(this.backupDir, fileName);

      const tablesData: Record<string, any[]> = {};
      let totalRecords = 0;

      for (const table of this.orderedTables) {
        try {
          const res = await this.db.query(`SELECT * FROM ${table} ORDER BY 1 ASC;`);
          tablesData[table] = res.rows;
          totalRecords += res.rows.length;
        } catch (err: any) {
          this.logger.warn(`Tabla '${table}' no encontrada o vacía: ${err.message}`);
          tablesData[table] = [];
        }
      }

      // Compute SHA-256 checksum of table content
      const contentRaw = JSON.stringify(tablesData);
      const sha256Checksum = crypto.createHash('sha256').update(contentRaw).digest('hex');

      const manifest: DatabaseBackupManifest = {
        backupId,
        createdAt: new Date().toISOString(),
        serverVersion: '1.0.0',
        sourceServerId: this.identityService.getServerId(),
        sha256Checksum,
        tableCount: Object.keys(tablesData).length,
        totalRecords,
        tables: tablesData,
      };

      fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8');
      this.logger.log(`Respaldo completado exitosamente: ${filePath} (${totalRecords} registros, SHA-256: ${sha256Checksum.slice(0, 12)}...)`);

      return {
        success: true,
        backupId,
        backupPath: filePath,
        sha256: sha256Checksum,
        totalRecords,
        tableCount: Object.keys(tablesData).length,
        recordCounts: {
          users: tablesData['users']?.length || 0,
          classrooms: tablesData['classrooms']?.length || 0,
          devices: tablesData['devices']?.length || 0,
        },
      };
    } catch (err: any) {
      this.logger.error(`Fallo crítico al crear respaldo: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public async restoreBackup(backupFilePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(backupFilePath)) {
        return { success: false, error: 'Archivo de respaldo no encontrado' };
      }

      this.logger.log(`Iniciando restauración de base de datos desde: ${backupFilePath}...`);
      const raw = fs.readFileSync(backupFilePath, 'utf8');
      const manifest: DatabaseBackupManifest = JSON.parse(raw);

      // Verify SHA-256 Integrity
      const contentRaw = JSON.stringify(manifest.tables);
      const computedHash = crypto.createHash('sha256').update(contentRaw).digest('hex');
      if (computedHash !== manifest.sha256Checksum) {
        throw new Error('Violación de integridad: el hash SHA-256 del respaldo no coincide con los datos.');
      }

      // Restore tables in dependency order
      const client = await this.db.getPool().connect();
      try {
        const existingTablesRes = await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';",
        );
        const existingTables = new Set(existingTablesRes.rows.map((r: any) => r.table_name));
        const validTables = this.orderedTables.filter((t) => existingTables.has(t));

        await client.query('BEGIN;');

        // Truncate existing tables in reverse dependency order
        for (const table of [...validTables].reverse()) {
          await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);
        }

        // Insert records table by table
        for (const table of validTables) {
          const rows = manifest.tables[table];
          if (rows && rows.length > 0) {
            for (const row of rows) {
              const columns = Object.keys(row);
              const values = Object.values(row).map((val) => {
                if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
                  return JSON.stringify(val);
                }
                return val;
              });
              const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
              const quotedCols = columns.map((c) => `"${c}"`).join(', ');

              const query = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING;`;
              await client.query(query, values);
            }
          }
        }

        await client.query('COMMIT;');
        this.logger.log(`Restauración completada con éxito desde ${backupFilePath}.`);
        return { success: true };
      } catch (err: any) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      this.logger.error(`Error durante la restauración: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public async exportMigrationPackage(): Promise<{
    success: boolean;
    packageId?: string;
    packagePath?: string;
    packageJson?: string;
    sha256?: string;
    signature?: string;
    error?: string;
  }> {
    try {
      this.logger.log('Exportando paquete de migración integral (Identidad + DB + Vínculos institucionales)...');
      const backupResult = await this.createBackup('migration-export');
      if (!backupResult.success || !backupResult.backupPath) {
        throw new Error(`Fallo al generar snapshot de base de datos: ${backupResult.error}`);
      }

      const backupManifest: DatabaseBackupManifest = JSON.parse(
        fs.readFileSync(backupResult.backupPath, 'utf8'),
      );

      const identity = this.identityService.getIdentity();
      const packageId = crypto.randomUUID();
      const exportedAt = new Date().toISOString();

      // Sign the bundle with server private key
      const signPayload = `${packageId}:${exportedAt}:${backupManifest.sha256Checksum}:${identity.serverId}`;
      const signature = this.identityService.signPayload(signPayload);

      const migrationPkg: MigrationPackage = {
        packageId,
        exportedAt,
        serverIdentity: identity,
        databaseBackup: backupManifest,
        signature,
      };

      const json = JSON.stringify(migrationPkg, null, 2);
      const pkgPath = path.join(this.backupDir, `assetschool_migration_package_${packageId.slice(0, 8)}.json`);
      fs.writeFileSync(pkgPath, json, 'utf8');

      const pkgSha256 = crypto.createHash('sha256').update(json).digest('hex');
      this.logger.log(`Paquete de migración generado exitosamente en: ${pkgPath}`);
      return {
        success: true,
        packageId,
        packagePath: pkgPath,
        packageJson: json,
        sha256: pkgSha256,
        signature,
      };
    } catch (err: any) {
      this.logger.error(`Error exportando paquete de migración: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public async importMigrationPackage(packageJson: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log('Importando paquete de migración integral en servidor receptor...');
      const pkg: MigrationPackage = JSON.parse(packageJson);

      if (!pkg.packageId || !pkg.serverIdentity || !pkg.databaseBackup) {
        throw new Error('Estructura de paquete de migración inválida');
      }

      // Verify signature using the exported server's public key
      const signPayload = `${pkg.packageId}:${pkg.exportedAt}:${pkg.databaseBackup.sha256Checksum}:${pkg.serverIdentity.serverId}`;
      const isValidSig = this.identityService.verifySignature(
        signPayload,
        pkg.signature,
        pkg.serverIdentity.publicKeyPem,
      );

      if (!isValidSig) {
        throw new Error('Firma criptográfica del paquete de migración no válida');
      }

      // 1. Import Server Cryptographic Identity
      const identityImported = this.identityService.importBundle(JSON.stringify(pkg.serverIdentity));
      if (!identityImported) {
        throw new Error('Fallo al importar identidad criptográfica del servidor');
      }

      // 2. Set Server Mode to Dedicated
      this.identityService.setServerMode('dedicated');

      // 3. Restore Database Snapshot
      const tempBackupPath = path.join(this.backupDir, `temp_migration_${pkg.packageId}.json`);
      fs.writeFileSync(tempBackupPath, JSON.stringify(pkg.databaseBackup, null, 2), 'utf8');

      const restoreResult = await this.restoreBackup(tempBackupPath);
      if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);

      if (!restoreResult.success) {
        throw new Error(`Fallo en restauración de datos durante migración: ${restoreResult.error}`);
      }

      this.logger.log('========================================================================');
      this.logger.log('  MIGRACIÓN EXITOSA: Servidor Local trasladado a Servidor Dedicado');
      this.logger.log(`  Identidad de Servidor: ${pkg.serverIdentity.serverId}`);
      this.logger.log(`  Total registros restaurados: ${pkg.databaseBackup.totalRecords}`);
      this.logger.log('========================================================================');

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Fallo durante la importación de migración: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public getBackupsList(): { name: string; sizeBytes: number; createdAt: string }[] {
    if (!fs.existsSync(this.backupDir)) return [];
    const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json'));
    return files.map((f) => {
      const stat = fs.statSync(path.join(this.backupDir, f));
      return {
        name: f,
        sizeBytes: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    });
  }
}
