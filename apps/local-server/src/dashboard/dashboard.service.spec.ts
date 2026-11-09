import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DatabaseService } from '../database/database.service';

describe('DashboardService', () => {
  let dashboardService: DashboardService;
  let dbService: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, DatabaseService],
    }).compile();

    dashboardService = module.get<DashboardService>(DashboardService);
    dbService = module.get<DatabaseService>(DatabaseService);
    await dbService.onModuleInit();
  });

  it('should return valid dashboard stats with LAN and Server health metrics', async () => {
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
