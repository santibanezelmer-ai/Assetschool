import { Injectable, Logger } from '@nestjs/common';
import * as os from 'node:os';
import { DatabaseService } from '../database/database.service';
import { ServerIdentityService, ServerOperatingMode } from '../identity/server-identity.service';
import { BackupManagerService } from '../database/backup-manager.service';
import { DiscoveryBeaconService } from '../discovery/discovery-beacon.service';
import { AgentGateway } from '../gateway/agent.gateway';
import { SfuService } from '../sfu/sfu.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly db: DatabaseService,
    private readonly identityService: ServerIdentityService,
    private readonly backupManager: BackupManagerService,
    private readonly discoveryService: DiscoveryBeaconService,
    private readonly gateway: AgentGateway,
    private readonly sfuService: SfuService,
  ) {}

  public async getServerStatus() {
    const memory = process.memoryUsage();
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    const dbHealth = this.db.getHealth();
    const discoveryStatus = this.discoveryService.getStatus();
    const identity = this.identityService.getIdentity();

    // Query connected devices count from gateway
    const agentCount = this.gateway.getConnectedAgentCount ? this.gateway.getConnectedAgentCount() : 0;
    const teacherCount = this.gateway.getConnectedTeacherCount ? this.gateway.getConnectedTeacherCount() : 0;

    return {
      serverId: identity.serverId,
      serverName: identity.serverName,
      serverMode: identity.serverMode,
      fingerprint: identity.fingerprintSha256,
      institutionId: identity.institutionId,
      version: identity.version,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuCount: cpus.length,
        loadAverage: loadAvg,
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        processMemoryBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
      },
      database: dbHealth,
      discovery: discoveryStatus,
      connections: {
        connectedAgents: agentCount,
        connectedTeachers: teacherCount,
      },
      sfu: {
        active: !!this.sfuService,
      },
    };
  }

  public async getConnectionsList() {
    return {
      agents: this.gateway.getAgentsList ? this.gateway.getAgentsList() : [],
      teachers: this.gateway.getTeachersList ? this.gateway.getTeachersList() : [],
    };
  }

  public async getClassroomsSummary() {
    if (!this.db.isDatabaseReady) {
      return { classrooms: [] };
    }

    const res = await this.db.query(`
      SELECT c.id, c.name, c.description, c.institution_id,
             COUNT(d.id) as device_count
      FROM classrooms c
      LEFT JOIN devices d ON d.current_classroom_id = c.id AND d.is_revoked = false
      GROUP BY c.id, c.name, c.description, c.institution_id
      ORDER BY c.name ASC;
    `);

    return { classrooms: res.rows };
  }

  public async createBackup(label?: string) {
    return this.backupManager.createBackup(label);
  }

  public async getBackupsList() {
    return this.backupManager.getBackupsList();
  }

  public async exportMigrationBundle() {
    return this.backupManager.exportMigrationPackage();
  }

  public async importMigrationBundle(bundleJson: string) {
    return this.backupManager.importMigrationPackage(bundleJson);
  }

  public setServerMode(mode: ServerOperatingMode) {
    this.identityService.setServerMode(mode);
    return { success: true, mode };
  }
}
