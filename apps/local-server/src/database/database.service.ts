import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { SystemRole, DevicePlatform, DeviceStatus } from '@assetschool/shared-types';

export interface StoredDevice {
  id: string;
  institutionId: string;
  hostname: string;
  macAddress: string;
  localIp: string;
  osType: DevicePlatform;
  osVersion: string;
  architecture: string;
  status: DeviceStatus;
  isDemo: boolean;
  currentClassroomId?: string;
  studentName?: string;
  enrolledAt: string;
  lastHeartbeatAt?: string;
  isRevoked: boolean;
  revocationReason?: string;
}
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private isPostgresConnected = false;

  // In-memory fallback dataset (matching 002_seed_data.sql)
  private memoryStore = {
    institutions: [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        code: 'CPC-01',
        name: 'Instituto Politécnico Central',
        description: 'Campus Principal - Red Educativa Local',
        address: 'Av. Tecnológica 1024, Edificio Norte',
        contactEmail: 'tic@politecnicocentral.edu',
        settingsJson: { lanSubnet: '192.168.1.0/24', allowUsbDefault: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    roles: [
      { id: '11111111-1111-1111-1111-111111111111', name: SystemRole.SUPERADMIN, permissions: ['*'] },
      { id: '22222222-2222-2222-2222-222222222222', name: SystemRole.INSTITUTION_ADMIN, permissions: ['institution:view', 'user:view', 'classroom:view', 'device:monitor', 'device:control'] },
      { id: '33333333-3333-3333-3333-333333333333', name: SystemRole.TEACHER, permissions: ['classroom:view', 'device:monitor', 'device:control', 'device:lock'] },
      { id: '44444444-4444-4444-4444-444444444444', name: SystemRole.TECH_SUPPORT, permissions: ['device:monitor', 'device:enroll', 'audit:view'] },
      { id: '55555555-5555-5555-5555-555555555555', name: SystemRole.STUDENT, permissions: ['classroom:view'] },
    ],
    users: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        role: SystemRole.INSTITUTION_ADMIN,
        email: 'admin@assetschool.lan',
        passwordHash: '$2b$10$wTqK/8vC0Vb5lZcQW3d26Op03wY8C6Kx.o8b/f5s8Ie1K/R.3t846',
        firstName: 'Carlos',
        lastName: 'Valenzuela',
        isActive: true,
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        role: SystemRole.TEACHER,
        email: 'profesor@assetschool.lan',
        passwordHash: '$2b$10$wTqK/8vC0Vb5lZcQW3d26Op03wY8C6Kx.o8b/f5s8Ie1K/R.3t846',
        firstName: 'Mariana',
        lastName: 'Fuentes',
        isActive: true,
      },
    ],
    classrooms: [
      {
        id: 'd1111111-1111-1111-1111-111111111111',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Laboratorio Informática 1',
        code: 'LAB-01',
        capacity: 32,
        subnetLan: '192.168.1.0/24',
        broadcastIp: '192.168.1.255',
        isOnline: true,
      },
      {
        id: 'd2222222-2222-2222-2222-222222222222',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Laboratorio Informática 2',
        code: 'LAB-02',
        capacity: 28,
        subnetLan: '192.168.2.0/24',
        broadcastIp: '192.168.2.255',
        isOnline: false,
      },
    ],
    devices: [
      {
        id: '01010101-0101-0101-0101-010101010101',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        hostname: 'LAB01-PC-01',
        macAddress: '02:42:AC:11:00:02',
        localIp: '192.168.1.101',
        osType: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11 Pro 23H2',
        architecture: 'x86_64',
        status: DeviceStatus.ONLINE,
        isDemo: true,
        currentClassroomId: 'd1111111-1111-1111-1111-111111111111',
        studentName: 'Lucas Pérez',
        enrolledAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        isRevoked: false,
      },
      {
        id: '02020202-0202-0202-0202-020202020202',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        hostname: 'LAB01-MAC-02',
        macAddress: '02:42:AC:11:00:03',
        localIp: '192.168.1.102',
        osType: DevicePlatform.MACOS,
        osVersion: 'macOS Sonoma 14.5',
        architecture: 'arm64',
        status: DeviceStatus.ONLINE,
        isDemo: true,
        currentClassroomId: 'd1111111-1111-1111-1111-111111111111',
        studentName: 'Sofía Navarro',
        enrolledAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        isRevoked: false,
      },
      {
        id: '03030303-0303-0303-0303-030303030303',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        hostname: 'LAB01-LNX-03',
        macAddress: '02:42:AC:11:00:04',
        localIp: '192.168.1.103',
        osType: DevicePlatform.LINUX,
        osVersion: 'Ubuntu 24.04 LTS',
        architecture: 'x86_64',
        status: DeviceStatus.BUSY,
        isDemo: true,
        currentClassroomId: 'd1111111-1111-1111-1111-111111111111',
        studentName: 'Mateo Rojas',
        enrolledAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        isRevoked: false,
      },
      {
        id: '04040404-0404-0404-0404-040404040404',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        hostname: 'LAB01-CRB-04',
        macAddress: '02:42:AC:11:00:05',
        localIp: '192.168.1.104',
        osType: DevicePlatform.CHROMEOS,
        osVersion: 'ChromeOS 124.0',
        architecture: 'x86_64',
        status: DeviceStatus.OFFLINE,
        isDemo: true,
        currentClassroomId: 'd1111111-1111-1111-1111-111111111111',
        studentName: 'Valentina Castillo',
        enrolledAt: new Date().toISOString(),
        lastHeartbeatAt: undefined,
        isRevoked: false,
      },
    ] as StoredDevice[],
    sessions: [
      {
        id: 's1111111-1111-1111-1111-111111111111',
        classroomId: 'd1111111-1111-1111-1111-111111111111',
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        title: 'Sesión Activa - Algoritmos y Estructuras de Datos',
        startedAt: new Date().toISOString(),
        isActive: true,
      },
    ],
    auditLogs: [
      {
        id: 'a1111111-1111-1111-1111-111111111111',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BOOT',
        actor: 'AssetSchool Core',
        details: 'Servidor inicializado en modo LAN Seguro',
        severity: 'info',
      },
    ],
    commands: [] as any[],
  };

  async onModuleInit() {
    const host = process.env.DATABASE_HOST || 'localhost';
    const port = Number(process.env.DATABASE_PORT) || 5432;
    const user = process.env.DATABASE_USER || 'assetschool_admin';
    const password = process.env.DATABASE_PASSWORD || 'assetschool_secure_pass_2026';
    const database = process.env.DATABASE_NAME || 'assetschool_db';

    try {
      this.pool = new Pool({
        host,
        port,
        user,
        password,
        database,
        connectionTimeoutMillis: 1500,
      });

      const client = await this.pool.connect();
      client.release();
      this.isPostgresConnected = true;
      this.logger.log(`Conectado exitosamente a PostgreSQL en ${host}:${port}/${database}`);
    } catch (err: any) {
      this.isPostgresConnected = false;
      this.logger.warn(`PostgreSQL no está disponible en ${host}:${port} (${err.message}). Utilizando almacén en memoria para desarrollo/pruebas locales.`);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  get isConnected(): boolean {
    return this.isPostgresConnected;
  }

  getStore() {
    return this.memoryStore;
  }

  async query<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (this.isPostgresConnected && this.pool) {
      return this.pool.query<T>(sql, params);
    }
    // Return empty results if using memory store directly
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
  }
}
