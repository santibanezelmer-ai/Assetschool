import { DashboardService } from './dashboard.service';
import { DatabaseService } from '../database/database.service';

describe('DashboardService Metrics & LAN Telemetry Tests', () => {
  let dashboardService: DashboardService;
  let dbService: DatabaseService;

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    dashboardService = new DashboardService(dbService);
  });

  afterEach(async () => {
    await dbService.onModuleDestroy();
  });

  it('should return valid dashboard stats with LAN and Server health metrics from database', async () => {
    const stats = await dashboardService.getStats();

    expect(stats).toBeDefined();
    expect(stats.totalRegisteredDevices).toBeGreaterThanOrEqual(4);
    expect(stats.connectedDevices).toBeGreaterThanOrEqual(2);
    expect(stats.availableClassrooms).toBe(2);
    expect(stats.serverStatus.status).toBe('online');
    expect(stats.lanStatus.multicastDiscoveryActive).toBe(true);
    expect(stats.recentEvents.length).toBeGreaterThan(0);
  });
});
