import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DashboardStats, DeviceStatus } from '@assetschool/shared-types';
import * as os from 'os';

@Injectable()
export class DashboardService {
  private startTime = Date.now();

  constructor(private readonly databaseService: DatabaseService) {}

  async getStats(institutionId?: string): Promise<DashboardStats> {
    const isReady = this.databaseService.isDatabaseReady;

    let totalRegistered = 0;
    let connected = 0;
    let disconnected = 0;
    let availableClassrooms = 0;
    let activeSessions = 0;
    let recentEvents: any[] = [];

    if (isReady) {
      try {
        let devSql = 'SELECT status, is_demo FROM devices';
        const params: any[] = [];
        if (institutionId) {
          devSql += ' WHERE institution_id = $1';
          params.push(institutionId);
        }

        const devRes = await this.databaseService.query(devSql, params);
        totalRegistered = devRes.rows.length;
        connected = devRes.rows.filter((r) => r.status === DeviceStatus.ONLINE).length;
        disconnected = devRes.rows.filter((r) => r.status === DeviceStatus.OFFLINE).length;

        let roomSql = 'SELECT count(*) as count FROM classrooms';
        const roomRes = await this.databaseService.query(
          institutionId ? `${roomSql} WHERE institution_id = $1` : roomSql,
          params,
        );
        availableClassrooms = parseInt(roomRes.rows[0]?.count || '0', 10);

        let sessSql = 'SELECT count(*) as count FROM classroom_sessions WHERE is_active = true';
        const sessRes = await this.databaseService.query(sessSql);
        activeSessions = parseInt(sessRes.rows[0]?.count || '0', 10);

        let auditSql = `SELECT id, action, details_json, timestamp FROM audit_logs`;
        if (institutionId) auditSql += ' WHERE institution_id = $1';
        auditSql += ' ORDER BY timestamp DESC LIMIT 10';

        const auditRes = await this.databaseService.query(auditSql, params);
        recentEvents = auditRes.rows.map((row) => ({
          id: row.id,
          timestamp: row.timestamp,
          action: row.action,
          actor: 'System / User',
          details: typeof row.details_json === 'string' ? row.details_json : JSON.stringify(row.details_json),
          severity: 'info',
        }));
      } catch {
        // Handled below
      }
    }

    // Detect LAN interface
    const networkInterfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    let ifaceName = 'lo0';

    for (const [name, addrs] of Object.entries(networkInterfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4') {
          localIp = addr.address;
          ifaceName = name;
          break;
        }
      }
    }

    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const memoryUsageMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    return {
      totalRegisteredDevices: totalRegistered,
      connectedDevices: connected,
      disconnectedDevices: disconnected,
      availableClassrooms,
      activeSessions,
      serverStatus: {
        status: isReady ? 'online' : 'degraded',
        uptimeSeconds,
        memoryUsageMb,
        version: '1.0.0-phase1.1',
        nodeVersion: process.version,
      },
      lanStatus: {
        interfaceName: ifaceName,
        localIp,
        subnet: '255.255.255.0',
        broadcastIp: '192.168.1.255',
        multicastDiscoveryActive: true,
        activeAgentSockets: connected,
      },
      recentEvents,
    };
  }

  async getOverview(institutionId?: string) {
    const stats = await this.getStats(institutionId);
    let classrooms: any[] = [];
    let demoDevices: any[] = [];
    let realDevices: any[] = [];
    let institution: any = null;

    if (this.databaseService.isDatabaseReady) {
      const roomRes = await this.databaseService.query(
        institutionId
          ? 'SELECT * FROM classrooms WHERE institution_id = $1 ORDER BY name ASC'
          : 'SELECT * FROM classrooms ORDER BY name ASC',
        institutionId ? [institutionId] : [],
      );
      classrooms = roomRes.rows;

      const devRes = await this.databaseService.query(
        institutionId
          ? 'SELECT * FROM devices WHERE institution_id = $1 ORDER BY hostname ASC'
          : 'SELECT * FROM devices ORDER BY hostname ASC',
        institutionId ? [institutionId] : [],
      );
      demoDevices = devRes.rows.filter((d) => d.is_demo);
      realDevices = devRes.rows.filter((d) => !d.is_demo);

      const instRes = await this.databaseService.query(
        institutionId
          ? 'SELECT * FROM institutions WHERE id = $1'
          : 'SELECT * FROM institutions LIMIT 1',
        institutionId ? [institutionId] : [],
      );
      institution = instRes.rows[0];
    }

    return {
      stats,
      classrooms,
      demoDevices,
      realDevices,
      institution,
    };
  }
}
