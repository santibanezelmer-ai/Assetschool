import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PacketType, createEnvelope } from '@assetschool/protocol';
import { DevicePlatform, SystemRole } from '@assetschool/shared-types';
import { DatabaseService } from '../database/database.service';
import { DevicesController } from '../devices/devices.controller';
import { DevicesService } from '../devices/devices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import {
  buildTwoTenantFixture,
  DEVICE_A1,
  INSTITUTION_B,
  mockSocket,
} from '../../test/isolation-fixture';
import { INSTITUTION_A } from '../../test/gateway-test-helpers';

/**
 * R0 — S4 (interim until R2 enrollment): unknown agents are quarantined, the
 * client-supplied device id is ignored and device registration requires an
 * administrator of the same institution.
 */
describe('R0 · S4 — Agent quarantine and protected registration', () => {
  let db: DatabaseService;
  let fx: Awaited<ReturnType<typeof buildTwoTenantFixture>>;

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    db = new DatabaseService();
    await db.onModuleInit();
    fx = await buildTwoTenantFixture(db);
  });

  afterEach(async () => {
    await db.onModuleDestroy();
  });

  const hello = (socket: any, mac: string, extra: Record<string, unknown> = {}) =>
    fx.gateway.handleAgentHello(
      socket,
      createEnvelope(PacketType.AGENT_HELLO, 'x', 'agent', {
        hostname: 'INTRUSO',
        macAddress: mac,
        localIp: '10.0.0.66',
        osType: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11',
        architecture: 'x64',
        agentVersion: '1.0.0',
        publicKey: 'n/a',
        ...extra,
      } as any),
    );

  it('an unknown MAC is quarantined: not enrolled, no device id, no default institution', async () => {
    const intruder = fx.register(mockSocket('intruder'));
    const ack: any = await hello(intruder, 'DE:AD:BE:EF:00:01');
    expect(ack.payload.isEnrolled).toBe(false);
    expect(ack.payload.assignedDeviceId).toBeUndefined();
    expect(ack.payload.institutionId).toBe('');
    expect((fx.gateway as any).connectedAgents.get('intruder').quarantined).toBe(true);
    expect(intruder.disconnect).not.toHaveBeenCalled();
  });

  it('a quarantined agent cannot hijack an enrolled device id (enrolledDeviceId is ignored)', async () => {
    const intruder = fx.register(mockSocket('intruder'));
    await hello(intruder, 'DE:AD:BE:EF:00:02', { enrolledDeviceId: DEVICE_A1 });

    await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });
    expect(fx.agentA1.received('COMMAND_DISPATCH').length).toBeGreaterThan(0);
    expect(intruder.emitted.filter((e) => e.event === 'COMMAND_DISPATCH')).toHaveLength(0);
  });

  it('a quarantined agent is not part of classroom-wide actions and its results are dropped', async () => {
    const intruder = fx.register(mockSocket('intruder'));
    await hello(intruder, 'DE:AD:BE:EF:00:03');
    fx.resetTraffic();
    const res = await fx.gateway.handleTeacherLockClassroom(fx.teacherA as any, {});
    expect(res.count).toBe(2);
    expect(intruder.emitted).toHaveLength(0);

    await fx.gateway.handleTeacherRequestProcesses(fx.teacherA as any, { deviceId: DEVICE_A1 });
    fx.resetTraffic();
    fx.gateway.handleProcessListResult(
      intruder as any,
      createEnvelope('PROCESS_LIST_RESULT' as any, 'x', 'server', { deviceId: DEVICE_A1, processes: [] }),
    );
    expect(fx.teacherA.received('PROCESS_LIST_RESULT')).toHaveLength(0);
  });

  it('a duplicate MAC cannot displace a live session of the same device', async () => {
    const intruder = fx.register(mockSocket('intruder'));
    const ack: any = await hello(intruder, '02:42:AC:11:00:02'); // MAC of DEVICE_A1, agent A1 alive
    expect(ack.payload.error).toBeDefined();
    expect(intruder.disconnect).toHaveBeenCalledWith(true);
    expect((fx.gateway as any).deviceToAgentSocket.get(DEVICE_A1)).toBe('agent-a1');

    const audit = await db.query("SELECT * FROM audit_logs WHERE action = 'AGENT_DUPLICATE_REJECTED'");
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].entity_id).toBe(DEVICE_A1);
  });

  it('a stale session is replaced by a reconnecting agent and the replacement is audited', async () => {
    (fx.gateway as any).connectedAgents.get('agent-a1').lastHeartbeatAt = Date.now() - 60_000;
    const reconnect = fx.register(mockSocket('agent-a1-reconnect'));
    const ack: any = await hello(reconnect, '02:42:AC:11:00:02');
    expect(ack.payload.isEnrolled).toBe(true);
    expect(ack.payload.assignedDeviceId).toBe(DEVICE_A1);
    expect((fx.gateway as any).deviceToAgentSocket.get(DEVICE_A1)).toBe('agent-a1-reconnect');
    expect(fx.agentA1.disconnect).toHaveBeenCalledWith(true);

    // The late disconnect of the old socket must not remove the new mapping.
    fx.gateway.handleDisconnect(fx.agentA1 as any);
    expect((fx.gateway as any).deviceToAgentSocket.get(DEVICE_A1)).toBe('agent-a1-reconnect');

    const audit = await db.query("SELECT * FROM audit_logs WHERE action = 'AGENT_SESSION_REPLACED'");
    expect(audit.rows).toHaveLength(1);
  });

  it('a MAC registered in two institutions is quarantined (ambiguous identity)', async () => {
    await db.query(
      `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, status)
       VALUES ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', $1, 'DUP-B', '02:42:AC:11:00:05', '10.0.0.40', 'windows', 'Win11', 'x64', 'offline')`,
      [INSTITUTION_B],
    );
    const s = fx.register(mockSocket('dup'));
    const ack: any = await hello(s, '02:42:AC:11:00:05'); // also seeded in institution A
    expect(ack.payload.isEnrolled).toBe(false);
  });

  it('agents are quarantined when the database is unavailable', async () => {
    (db as any).isConnected = false;
    const s = fx.register(mockSocket('nodb'));
    const ack: any = await hello(s, '02:42:AC:11:00:04');
    (db as any).isConnected = true;
    expect(ack.payload.isEnrolled).toBe(false);
    expect(ack.payload.institutionId).toBe('');
  });

  describe('POST /api/v1/devices/register', () => {
    it('requires JWT + RolesGuard and an administrative role', () => {
      const handler = DevicesController.prototype.register;
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
      const roles = Reflect.getMetadata(ROLES_KEY, handler);
      expect(roles).toEqual([SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT]);
      expect(roles).not.toContain(SystemRole.TEACHER);
      expect(roles).not.toContain(SystemRole.STUDENT);
    });

    const registration = (institutionCode: string) => ({
      institutionCode,
      hostname: 'NUEVO-PC',
      macAddress: 'AA:AA:AA:00:00:99',
      localIp: '10.0.0.99',
      osType: DevicePlatform.WINDOWS,
      osVersion: 'Windows 11',
      architecture: 'x64',
      agentVersion: '1.0.0',
      capabilities: {
        canScreenBroadcast: true,
        canScreenReceive: true,
        canRemoteInput: true,
        canLockInput: true,
        canBlackoutScreen: true,
        canFileTransfer: true,
        canProcessBlock: true,
        canUrlBlock: false,
        canChat: false,
        canExecuteCommand: false,
        canCollectHardwareInventory: true,
      },
    });

    it('an administrator cannot register a device into another institution', async () => {
      const service = new DevicesService(db);
      await expect(service.registerAgent(registration('INST-B') as any, INSTITUTION_A)).rejects.toThrow(ForbiddenException);
    });

    it('an administrator can register a device in the own institution', async () => {
      const service = new DevicesService(db);
      const res: any = await service.registerAgent(registration('CPC-01') as any, INSTITUTION_A);
      expect(res).toBeDefined();
    });
  });
});
