import { DatabaseService } from './database.service';
import { DevicesService } from '../devices/devices.service';
import { CommandsService } from '../commands/commands.service';
import { randomUUID } from 'crypto';
import { CommandType, DevicePlatform } from '@assetschool/shared-types';

describe('Multi-Institution Tenant Isolation Tests', () => {
  let db: DatabaseService;
  let devicesService: DevicesService;
  let commandsService: CommandsService;

  const instAId = randomUUID();
  const instBId = randomUUID();
  const deviceAId = randomUUID();
  const deviceBId = randomUUID();

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    db = new DatabaseService();
    await db.onModuleInit();

    devicesService = new DevicesService(db);
    commandsService = new CommandsService(db);

    // Seed Institution A
    await db.query(
      `INSERT INTO institutions (id, code, name, contact_email)
       VALUES ($1, 'INST-A', 'Colegio San Martin A', 'tic@sanmartin-a.edu')`,
      [instAId],
    );

    // Seed Institution B
    await db.query(
      `INSERT INTO institutions (id, code, name, contact_email)
       VALUES ($1, 'INST-B', 'Colegio Santa Maria B', 'tic@santamaria-b.edu')`,
      [instBId],
    );

    // Seed device in Institution A
    await db.query(
      `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, is_demo)
       VALUES ($1, $2, 'A-PC-01', '10:00:00:00:00:01', '192.168.1.10', 'windows', '11', 'x64', false)`,
      [deviceAId, instAId],
    );

    // Seed device in Institution B
    await db.query(
      `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, is_demo)
       VALUES ($1, $2, 'B-PC-01', '20:00:00:00:00:01', '192.168.2.10', 'linux', 'Ubuntu', 'x64', false)`,
      [deviceBId, instBId],
    );
  });

  afterEach(async () => {
    await db.onModuleDestroy();
  });

  it('should isolate devices list by institution_id', async () => {
    const listA = await devicesService.findAll(undefined, true, instAId);
    expect(listA.length).toBe(1);
    expect(listA[0].hostname).toBe('A-PC-01');

    const listB = await devicesService.findAll(undefined, true, instBId);
    expect(listB.length).toBe(1);
    expect(listB[0].hostname).toBe('B-PC-01');
  });

  it('should reject device revocation if device belongs to another institution', async () => {
    // Attempting to revoke Device B using Institution A credentials must fail
    await expect(
      devicesService.revokeDevice(deviceBId, 'Unauthorized attempt', 'admin@inst-a.edu', instAId),
    ).rejects.toThrow();
  });

  it('should reject command dispatch to devices of another institution', async () => {
    await expect(
      commandsService.dispatch(
        {
          deviceIds: [deviceBId],
          commandType: CommandType.LOCK_SCREEN,
          params: {},
        },
        'user-from-inst-a',
        'teacher@inst-a.edu',
        instAId,
      ),
    ).rejects.toThrow();
  });
});
