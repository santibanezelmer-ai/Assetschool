import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DashboardStats, DeviceStatus } from '@assetschool/shared-types';
import * as os from 'os';

@Injectable()
export class DashboardService {
  private startTime = Date.now();

  constructor(private readonly databaseService: DatabaseService) {}

  async getStats(): Promise<DashboardStats> {
    const store = this.databaseService.getStore();
    const devices = store.devices;
    const connectedDevices = devices.filter((d) => d.status === DeviceStatus.ONLINE).length;
    const disconnectedDevices = devices.filter((d) => d.status === DeviceStatus.OFFLINE).length;
    const availableClassrooms = store.classrooms.length;
    const activeSessions = store.sessions.filter((s) => s.isActive).length;

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
      totalRegisteredDevices: devices.length,
      connectedDevices,
      disconnectedDevices,
      availableClassrooms,
      activeSessions,
      serverStatus: {
        status: 'online',
        uptimeSeconds,
        memoryUsageMb,
        version: '1.0.0-phase1',
        nodeVersion: process.version,
      },
      lanStatus: {
        interfaceName: ifaceName,
        localIp,
        subnet: '255.255.255.0',
        broadcastIp: '192.168.1.255',
        multicastDiscoveryActive: true,
        activeAgentSockets: connectedDevices,
      },
      recentEvents: store.auditLogs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        action: log.action,
        actor: log.actor,
        details: log.details,
        severity: log.severity as any,
      })),
    };
  }

  async getOverview() {
    const stats = await this.getStats();
    const store = this.databaseService.getStore();
    return {
      stats,
      classrooms: store.classrooms,
      demoDevices: store.devices.filter((d) => d.isDemo),
      realDevices: store.devices.filter((d) => !d.isDemo),
      institution: store.institutions[0],
    };
  }
}
