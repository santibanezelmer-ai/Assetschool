import { DatabaseService } from './database.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';

describe('PostgreSQL Persistence & Referential Integrity Tests', () => {
  let db: DatabaseService;

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    db = new DatabaseService();
    await db.onModuleInit();
  });

  afterEach(async () => {
    await db.onModuleDestroy();
  });

  it('should have all 19 schema tables loaded and ready', async () => {
    const res = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(res.rows.length).toBe(19);

    const tableNames = res.rows.map((r: any) => r.table_name);
    expect(tableNames).toContain('institutions');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('roles');
    expect(tableNames).toContain('classrooms');
    expect(tableNames).toContain('devices');
    expect(tableNames).toContain('device_agents');
    expect(tableNames).toContain('device_capabilities');
    expect(tableNames).toContain('commands');
    expect(tableNames).toContain('audit_logs');
    expect(tableNames).toContain('policies');
  });

  it('should enforce unique constraint on institution code and device MAC address', async () => {
    // 1. Duplicate institution code must fail
    await expect(
      db.query(
        `INSERT INTO institutions (id, code, name, contact_email) 
         VALUES ($1, 'CPC-01', 'Duplicate Institution', 'test@test.edu')`,
        [randomUUID()],
      ),
    ).rejects.toThrow();

    // 2. Duplicate device MAC in the same institution must fail
    await expect(
      db.query(
        `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture)
         VALUES ($1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DUPLICATE-PC', '02:42:AC:11:00:02', '192.168.1.200', 'windows', '11', 'x64')`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it('should enforce referential integrity with ON DELETE CASCADE from institutions to devices', async () => {
    const testInstId = randomUUID();
    const testDeviceId = randomUUID();

    // Create isolated test institution
    await db.query(
      `INSERT INTO institutions (id, code, name, contact_email)
       VALUES ($1, 'TEST-CASCADE', 'Cascade Test Inst', 'cascade@test.edu')`,
      [testInstId],
    );

    // Create device linked to test institution
    await db.query(
      `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture)
       VALUES ($1, $2, 'CASCADE-PC', '00:11:22:33:44:99', '192.168.10.50', 'linux', 'Ubuntu', 'x86_64')`,
      [testDeviceId, testInstId],
    );

    // Verify device exists
    const before = await db.query('SELECT * FROM devices WHERE id = $1', [testDeviceId]);
    expect(before.rows.length).toBe(1);

    // Delete institution -> Must cascade and delete the device automatically
    await db.query('DELETE FROM institutions WHERE id = $1', [testInstId]);

    const after = await db.query('SELECT * FROM devices WHERE id = $1', [testDeviceId]);
    expect(after.rows.length).toBe(0);
  });

  it('should refuse operations with ServiceUnavailableException when not connected in production mode', async () => {
    delete process.env.DATABASE_MODE;
    const prodDb = new DatabaseService();
    // Simulate disconnected state
    await expect(prodDb.query('SELECT 1')).rejects.toThrow(ServiceUnavailableException);
  });
});
