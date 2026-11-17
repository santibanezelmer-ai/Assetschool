/**
 * R0 — Integration on REAL PostgreSQL 16 (embedded-postgres, see
 * test/pg-global-setup.mjs) with the real Nest HTTP + Socket.IO server and real
 * socket.io clients: 2 institutions, 2 teachers, 3 enrolled agents + 1 intruder.
 *
 * Run with: npm run test:pg --workspace=apps/local-server
 *
 * The agents are protocol clients (socket.io), not the native agents: this
 * suite verifies the server's isolation, not capture or WebRTC media.
 */
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket as ClientSocket } from 'socket.io-client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DevicesModule } from './devices/devices.module';
import { ClassroomsModule } from './classrooms/classrooms.module';
import { CommandsModule } from './commands/commands.module';
import { AuditModule } from './audit/audit.module';
import { GatewayModule } from './gateway/gateway.module';

// Same modules as AppModule except DiscoveryModule (no UDP broadcast on the LAN during tests).
@Module({
  imports: [DatabaseModule, AuthModule, DashboardModule, DevicesModule, ClassroomsModule, CommandsModule, AuditModule, GatewayModule],
})
class R0IntegrationModule {}

const INSTITUTION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSTITUTION_B = 'bbbbbbbb-0000-0000-0000-00000000000b';
const CLASSROOM_A1 = 'd1111111-1111-1111-1111-111111111111';
const CLASSROOM_A2 = 'd2222222-2222-2222-2222-222222222222';
const CLASSROOM_B1 = 'd000000b-0000-0000-0000-00000000000b';
const DEVICE_A1 = '01010101-0101-0101-0101-010101010101';
const DEVICE_A2 = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a';
const DEVICE_B1 = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b';
const TEACHER_B_ID = 'cccccccc-0000-0000-0000-00000000000b';
const ADMIN_B_ID = 'bbbbbbbb-0000-0000-0000-0000000000ad';

type Recorded = { event: string; data: any };

describe('R0 · Integration on real PostgreSQL 16 — two institutions', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let baseUrl: string;
  const password = `R0-${randomBytes(12).toString('base64url')}!a1`;
  const sockets: ClientSocket[] = [];
  const traffic = new Map<ClientSocket, Recorded[]>();

  const http = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  };

  const login = async (email: string) => {
    const res = await http('POST', '/api/v1/auth/login', { email, password });
    expect(res.status).toBe(200);
    return res.json as { accessToken: string; refreshToken: string; user: any };
  };

  const connect = async (): Promise<ClientSocket> => {
    const s = io(baseUrl, { transports: ['websocket'], reconnection: false, forceNew: true });
    const rec: Recorded[] = [];
    s.onAny((event, data) => rec.push({ event, data }));
    traffic.set(s, rec);
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', reject);
    });
    return s;
  };

  const received = (s: ClientSocket, event: string) => (traffic.get(s) || []).filter((r) => r.event === event);
  const clearTraffic = () => traffic.forEach((rec) => (rec.length = 0));
  const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

  const connectAgent = async (mac: string, hostname: string, extra: Record<string, unknown> = {}) => {
    const s = await connect();
    const ack = new Promise<any>((resolve) => s.once('SERVER_HELLO_ACK', resolve));
    s.emit('AGENT_HELLO', {
      packetId: randomUUID(),
      packetType: 'AGENT_HELLO',
      timestamp: Date.now(),
      senderId: hostname,
      senderType: 'agent',
      protocolVersion: '1.0.0',
      payload: {
        hostname,
        macAddress: mac,
        localIp: '127.0.0.1',
        osType: 'windows',
        osVersion: 'Windows 11',
        architecture: 'x64',
        agentVersion: '1.0.0',
        publicKey: 'n/a',
        ...extra,
      },
    });
    return { socket: s, ack: await ack };
  };

  const joinTeacher = async (token: string) => {
    const s = await connect();
    const res = await s.timeout(5000).emitWithAck('TEACHER_JOIN_CLASSROOM', { token });
    return { socket: s, res };
  };

  let teacherA: ClientSocket;
  let teacherB: ClientSocket;
  let agentA1: ClientSocket;
  let agentA2: ClientSocket;
  let agentB1: ClientSocket;
  let intruder: ClientSocket;
  let tokens: Record<string, { accessToken: string; refreshToken: string }> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [R0IntegrationModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    db = app.get(DatabaseService);
    expect(db.isDatabaseReady).toBe(true);
    expect(db.engine).toBe('postgresql');

    const hash = await bcrypt.hash(password, 10);
    await db.query(`INSERT INTO institutions (id, code, name, contact_email) VALUES ($1, 'INST-B', 'Colegio B', 'b@b.edu')`, [INSTITUTION_B]);
    await db.query(`INSERT INTO classrooms (id, institution_id, name, code) VALUES ($1, $2, 'Lab B', 'LAB-B')`, [CLASSROOM_B1, INSTITUTION_B]);
    await db.query(`UPDATE users SET password_hash = $1, must_change_password = false WHERE email = 'profesor@assetschool.lan'`, [hash]);
    await db.query(`UPDATE users SET password_hash = $1, must_change_password = true WHERE email = 'admin@assetschool.lan'`, [hash]);
    await db.query(
      `INSERT INTO users (id, institution_id, role_id, email, password_hash, first_name, last_name, must_change_password) VALUES
       ($1, $2, '33333333-3333-3333-3333-333333333333', 'profesor@colegiob.edu', $3, 'Prof', 'B', false),
       ($4, $2, '22222222-2222-2222-2222-222222222222', 'admin@colegiob.edu', $3, 'Admin', 'B', false)`,
      [TEACHER_B_ID, INSTITUTION_B, hash, ADMIN_B_ID],
    );
    await db.query(
      `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, status, current_classroom_id) VALUES
       ($1, $2, 'LAB02-PC-01', '02:42:AC:11:00:0A', '127.0.0.1', 'windows', 'Win11', 'x64', 'offline', $3),
       ($4, $5, 'COLB-PC-01', '02:42:AC:11:00:0B', '127.0.0.1', 'windows', 'Win11', 'x64', 'offline', $6)`,
      [DEVICE_A2, INSTITUTION_A, CLASSROOM_A2, DEVICE_B1, INSTITUTION_B, CLASSROOM_B1],
    );

    tokens.teacherA = await login('profesor@assetschool.lan');
    tokens.teacherB = await login('profesor@colegiob.edu');
    tokens.adminA = await login('admin@assetschool.lan');
    tokens.adminB = await login('admin@colegiob.edu');

    agentA1 = (await connectAgent('02:42:AC:11:00:02', 'LAB01-PC-01')).socket;
    agentA2 = (await connectAgent('02:42:AC:11:00:0A', 'LAB02-PC-01')).socket;
    agentB1 = (await connectAgent('02:42:AC:11:00:0B', 'COLB-PC-01')).socket;
    const joinedA = await joinTeacher(tokens.teacherA.accessToken);
    const joinedB = await joinTeacher(tokens.teacherB.accessToken);
    expect(joinedA.res.success).toBe(true);
    expect(joinedB.res.success).toBe(true);
    teacherA = joinedA.socket;
    teacherB = joinedB.socket;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app?.close();
  });

  beforeEach(() => clearTraffic());

  it('runs against PostgreSQL 16 (not pg-mem)', () => {
    expect(process.env.R0_PG_VERSION).toMatch(/^PostgreSQL 16\./);
  });

  describe('REST · S7b and S4', () => {
    it('a refresh token is rejected as an access token', async () => {
      const res = await http('GET', '/api/v1/devices', undefined, tokens.teacherA.refreshToken);
      expect(res.status).toBe(401);
    });

    it('a user with a pending password change can only use me/change-password', async () => {
      expect((await http('GET', '/api/v1/devices', undefined, tokens.adminA.accessToken)).status).toBe(403);
      expect((await http('GET', '/api/v1/auth/me', undefined, tokens.adminA.accessToken)).status).toBe(200);
    });

    it('after changing the password the same access token works (no lock-out until re-login)', async () => {
      // Separate user so the other assertions keep a pending-change user.
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        `INSERT INTO users (id, institution_id, role_id, email, password_hash, first_name, last_name, must_change_password)
         VALUES ('dddddddd-0000-0000-0000-00000000000d', $1, '33333333-3333-3333-3333-333333333333', 'nuevo@assetschool.lan', $2, 'N', 'D', true)`,
        [INSTITUTION_A, hash],
      );
      const fresh = await login('nuevo@assetschool.lan');
      expect((await http('GET', '/api/v1/devices', undefined, fresh.accessToken)).status).toBe(403);
      const changed = await http(
        'POST',
        '/api/v1/auth/change-password',
        { currentPassword: password, newPassword: `Nuev0-${randomBytes(6).toString('hex')}!` },
        fresh.accessToken,
      );
      expect(changed.status).toBe(200);
      expect((await http('GET', '/api/v1/devices', undefined, fresh.accessToken)).status).toBe(200);
      const join = await joinTeacher(fresh.accessToken);
      expect(join.res.success).toBe(true);
    });

    it('a teacher sees only devices of the own institution', async () => {
      const res = await http('GET', '/api/v1/devices', undefined, tokens.teacherA.accessToken);
      expect(res.status).toBe(200);
      const ids = res.json.map((d: any) => d.id);
      expect(ids).toContain(DEVICE_A1);
      expect(ids).not.toContain(DEVICE_B1);
    });

    const registration = (institutionCode: string, mac: string) => ({
      institutionCode,
      hostname: 'NUEVO-PC',
      macAddress: mac,
      localIp: '127.0.0.1',
      osType: 'windows',
      osVersion: 'Windows 11',
      architecture: 'x64',
      agentVersion: '1.0.0',
      publicKey: 'r0-integration-placeholder-key',
      capabilities: {
        canScreenBroadcast: true, canScreenReceive: true, canRemoteInput: true, canLockInput: true,
        canBlackoutScreen: true, canFileTransfer: true, canProcessBlock: true, canUrlBlock: false,
        canChat: false, canExecuteCommand: false, canCollectHardwareInventory: true,
      },
    });

    it('device registration requires authentication, an admin role and the own institution', async () => {
      expect((await http('POST', '/api/v1/devices/register', registration('INST-B', 'AA:00:00:00:00:01'))).status).toBe(401);
      expect((await http('POST', '/api/v1/devices/register', registration('INST-B', 'AA:00:00:00:00:01'), tokens.teacherB.accessToken)).status).toBe(403);
      expect((await http('POST', '/api/v1/devices/register', registration('CPC-01', 'AA:00:00:00:00:01'), tokens.adminB.accessToken)).status).toBe(403);
      const ok = await http('POST', '/api/v1/devices/register', registration('INST-B', 'AA:00:00:00:00:01'), tokens.adminB.accessToken);
      expect([200, 201]).toContain(ok.status);
    });
  });

  describe('WebSocket · S9', () => {
    it('refresh tokens and pending-password users cannot join', async () => {
      expect((await joinTeacher(tokens.teacherA.refreshToken)).res.success).toBe(false);
      expect((await joinTeacher(tokens.adminA.accessToken)).res.success).toBe(false);
    });
  });

  describe('WebSocket · S1 cross-tenant matrix (teacher A -> device B1)', () => {
    const matrix: Array<[string, any]> = [
      ['TEACHER_LOCK_DEVICE', { deviceId: DEVICE_B1 }],
      ['TEACHER_UNLOCK_DEVICE', { deviceId: DEVICE_B1 }],
      ['TEACHER_LIST_DIR', { deviceId: DEVICE_B1, dirPath: '/' }],
      ['TEACHER_SEND_FILE', { deviceId: DEVICE_B1, fileName: 'x.txt', fileSizeBytes: 1, fileContentBase64: 'eA==' }],
      ['TEACHER_COLLECT_FILE', { deviceId: DEVICE_B1, filePath: 'x.txt' }],
      ['TEACHER_REQUEST_PROCESSES', { deviceId: DEVICE_B1 }],
      ['TEACHER_KILL_PROCESS', { deviceId: DEVICE_B1, pid: 1 }],
    ];

    it.each(matrix)('%s is rejected and B1 receives nothing', async (event, body) => {
      const res = await teacherA.timeout(5000).emitWithAck(event, body);
      expect(res.success).toBe(false);
      await settle();
      expect(traffic.get(agentB1)).toHaveLength(0);
    });

    it('TEACHER_REMOTE_INPUT and SCREEN_CAPTURE_START to B1 are rejected', async () => {
      teacherA.emit('TEACHER_REMOTE_INPUT', { deviceId: DEVICE_B1, type: 'click', x: 1, y: 1 });
      const start = await teacherA.timeout(5000).emitWithAck('SCREEN_CAPTURE_START', {
        packetId: randomUUID(), packetType: 'SCREEN_CAPTURE_START', timestamp: Date.now(),
        senderId: 'x', senderType: 'server', protocolVersion: '1.0.0',
        payload: { teacherId: 'x', deviceId: DEVICE_B1, sessionId: 'pg_cross', qualityTier: 'thumbnail' },
      });
      expect(start.packetType).toBe('WEBRTC_ERROR');
      await settle();
      expect(traffic.get(agentB1)).toHaveLength(0);
    });
  });

  describe('WebSocket · legitimate flows, S2 routing, S3 scope, S8 events', () => {
    it('lock own device: delivered, status only to own institution, audited in PostgreSQL', async () => {
      const res = await teacherA.timeout(5000).emitWithAck('TEACHER_LOCK_DEVICE', { deviceId: DEVICE_A1 });
      expect(res.success).toBe(true);
      await settle();
      expect(received(agentA1, 'COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(received(teacherA, 'DEVICE_STATUS_CHANGED').length).toBeGreaterThan(0);
      expect(received(teacherB, 'DEVICE_STATUS_CHANGED')).toHaveLength(0);
      expect(received(agentA2, 'DEVICE_STATUS_CHANGED')).toHaveLength(0);
      const audit = await db.query(`SELECT * FROM audit_logs WHERE action = 'DEVICE_LOCK' AND entity_id = $1`, [DEVICE_A1]);
      expect(audit.rows.length).toBeGreaterThan(0);
      expect(audit.rows[0].institution_id).toBe(INSTITUTION_A);
    });

    it('collected file content reaches only the requesting teacher', async () => {
      const res = await teacherA.timeout(5000).emitWithAck('TEACHER_COLLECT_FILE', { deviceId: DEVICE_A1, filePath: 'tarea.docx' });
      expect(res.success).toBe(true);
      await settle();
      const request = received(agentA1, 'FILE_COLLECT')[0].data;
      clearTraffic();
      agentA1.emit('FILE_COLLECT_RESULT', {
        packetType: 'FILE_COLLECT_RESULT',
        payload: { collectId: request.payload.collectId, fileName: 'tarea.docx', fileContentBase64: 'Q09OVEVOSURP', success: true },
      });
      await settle();
      expect(received(teacherA, 'FILE_COLLECT_RESULT')).toHaveLength(1);
      for (const other of [teacherB, agentA1, agentA2, agentB1]) {
        expect(received(other, 'FILE_COLLECT_RESULT')).toHaveLength(0);
      }
    });

    it('lock classroom: own institution only, and classroom scope when given', async () => {
      const all = await teacherA.timeout(5000).emitWithAck('TEACHER_LOCK_CLASSROOM', {});
      expect(all.count).toBe(2);
      await settle();
      expect(received(agentA1, 'COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(received(agentA2, 'COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(received(agentB1, 'COMMAND_DISPATCH')).toHaveLength(0);

      clearTraffic();
      const a1 = await teacherA.timeout(5000).emitWithAck('TEACHER_LOCK_CLASSROOM', { classroomId: CLASSROOM_A1 });
      expect(a1.count).toBe(1);
      const foreign = await teacherA.timeout(5000).emitWithAck('TEACHER_LOCK_CLASSROOM', { classroomId: CLASSROOM_B1 });
      expect(foreign.success).toBe(false);
      await settle();
      expect(received(agentA2, 'COMMAND_DISPATCH')).toHaveLength(0);
      expect(received(agentB1, 'COMMAND_DISPATCH')).toHaveLength(0);
    });
  });

  describe('WebSocket · S4 quarantine', () => {
    it('an unknown agent is quarantined and cannot hijack a device id', async () => {
      const { socket, ack } = await connectAgent('DE:AD:BE:EF:00:01', 'INTRUSO', { enrolledDeviceId: DEVICE_A1 });
      intruder = socket;
      expect(ack.payload.isEnrolled).toBe(false);
      expect(ack.payload.institutionId).toBe('');
      clearTraffic();

      await teacherA.timeout(5000).emitWithAck('TEACHER_LOCK_DEVICE', { deviceId: DEVICE_A1 });
      await teacherA.timeout(5000).emitWithAck('TEACHER_LOCK_CLASSROOM', {});
      await settle();
      expect(received(agentA1, 'COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(traffic.get(intruder)).toHaveLength(0);
    });

    it('a second connection with the MAC of a live device is rejected and audited', async () => {
      const { ack } = await connectAgent('02:42:AC:11:00:02', 'LAB01-PC-01-CLON');
      expect(ack.payload.error).toBeDefined();
      const audit = await db.query(`SELECT * FROM audit_logs WHERE action = 'AGENT_DUPLICATE_REJECTED'`);
      expect(audit.rows.length).toBeGreaterThan(0);
    });
  });

  it('institution B has no audit rows caused by teacher A', async () => {
    const res = await db.query(
      `SELECT * FROM audit_logs WHERE institution_id = $1 AND actor_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`,
      [INSTITUTION_B],
    );
    expect(res.rows).toHaveLength(0);
  });
});
