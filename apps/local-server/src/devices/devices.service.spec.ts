import { DevicesService } from './devices.service';
import { DatabaseService } from '../database/database.service';
import { DevicePlatform } from '@assetschool/shared-types';

describe('DevicesService Persistence Tests', () => {
  let devicesService: DevicesService;
  let dbService: DatabaseService;

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    devicesService = new DevicesService(dbService);
  });

  afterEach(async () => {
    await dbService.onModuleDestroy();
  });

  it('should list all demo devices', async () => {
    const devices = await devicesService.findAll();
    expect(devices.length).toBeGreaterThanOrEqual(4);
    const demoDevices = devices.filter((d: any) => d.is_demo);
    expect(demoDevices.length).toBe(4);
  });

  it('should register a new physical device agent in database', async () => {
    const registrationResult = await devicesService.registerAgent({
      institutionCode: 'CPC-01',
      hostname: 'AULA-PC-PHYSICAL-01',
      macAddress: 'AA:BB:CC:DD:EE:01',
      localIp: '192.168.1.150',
      osType: DevicePlatform.WINDOWS,
      osVersion: 'Windows 11 Education',
      architecture: 'x86_64',
      agentVersion: '1.0.0',
      publicKey: 'ssh-ed25519-AAAAC3NzaC1lZDI1NTE5AAAAI-sample',
      capabilities: {
        canScreenBroadcast: true,
        canScreenReceive: true,
        canRemoteInput: true,
        canLockInput: true,
        canBlackoutScreen: true,
        canFileTransfer: true,
        canProcessBlock: true,
        canUrlBlock: true,
        canChat: true,
        canExecuteCommand: true,
        canCollectHardwareInventory: true,
      },
    });

    expect(registrationResult.isEnrolled).toBe(true);
    expect(registrationResult.deviceId).toBeDefined();

    const enrolled = await devicesService.findOne(registrationResult.deviceId);
    expect(enrolled.is_demo).toBe(false);
    expect(enrolled.hostname).toBe('AULA-PC-PHYSICAL-01');
  });

  it('should revoke a compromised device and record audit log', async () => {
    const devices = await devicesService.findAll();
    const target = devices[0];

    const revokeResult = await devicesService.revokeDevice(
      target.id,
      'Actividad sospechosa en red LAN',
      'admin@assetschool.lan',
    );

    expect(revokeResult.revoked).toBe(true);
    const updated = await devicesService.findOne(target.id);
    expect(updated.is_revoked).toBe(true);
  });
});
