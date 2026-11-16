import { PacketType, createEnvelope } from '@assetschool/protocol';
import { DatabaseService } from '../database/database.service';
import {
  buildTwoTenantFixture,
  CLASSROOM_A2,
  CLASSROOM_B1,
  DEVICE_A1,
  DEVICE_A2,
  DEVICE_B1,
  mockSocket,
} from '../../test/isolation-fixture';
import { CLASSROOM_A1 } from '../../test/gateway-test-helpers';

/**
 * R0 — S1 (per-device authorization), S3 (classroom-wide scope) and
 * S8 (status events scoped to the institution).
 */
describe('R0 · S1/S3/S8 — Gateway tenant isolation', () => {
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

  const crossTenantActions: Array<[string, (t: any) => Promise<any>]> = [
    ['TEACHER_LOCK_DEVICE', (t) => fx.gateway.handleTeacherLockDevice(t, { deviceId: DEVICE_B1 })],
    ['TEACHER_UNLOCK_DEVICE', (t) => fx.gateway.handleTeacherUnlockDevice(t, { deviceId: DEVICE_B1 })],
    ['TEACHER_LIST_DIR', (t) => fx.gateway.handleTeacherListDir(t, { deviceId: DEVICE_B1, dirPath: '/' })],
    [
      'TEACHER_SEND_FILE',
      (t) =>
        fx.gateway.handleTeacherSendFile(t, {
          deviceId: DEVICE_B1,
          fileName: 'x.txt',
          fileSizeBytes: 1,
          fileContentBase64: 'eA==',
        }),
    ],
    ['TEACHER_COLLECT_FILE', (t) => fx.gateway.handleTeacherCollectFile(t, { deviceId: DEVICE_B1, filePath: 'a.txt' })],
    ['TEACHER_REQUEST_PROCESSES', (t) => fx.gateway.handleTeacherRequestProcesses(t, { deviceId: DEVICE_B1 })],
    ['TEACHER_KILL_PROCESS', (t) => fx.gateway.handleTeacherKillProcess(t, { deviceId: DEVICE_B1, pid: 1 })],
    [
      'TEACHER_REMOTE_INPUT',
      (t) => fx.gateway.handleTeacherRemoteInput(t, { deviceId: DEVICE_B1, type: 'mousemove', x: 1, y: 1 }),
    ],
    [
      'SCREEN_CAPTURE_START',
      (t) =>
        fx.gateway.handleScreenCaptureStart(
          t,
          createEnvelope(PacketType.SCREEN_CAPTURE_START, 'teacher', 'server', {
            teacherId: 'x',
            deviceId: DEVICE_B1,
            sessionId: 'cross_tenant_stream',
            qualityTier: 'thumbnail' as const,
          }),
        ),
    ],
  ];

  describe('S1 · a teacher of institution A cannot act on a device of institution B', () => {
    it.each(crossTenantActions)('%s is rejected and nothing reaches the foreign agent', async (_name, action) => {
      const res = await action(fx.teacherA);
      if (res !== undefined) {
        const failed = res.success === false || res.packetType === PacketType.WEBRTC_ERROR;
        expect(failed).toBe(true);
      }
      expect(fx.agentB1.emitted).toHaveLength(0);
    });
  });

  describe('S1 · unauthenticated sockets cannot act on any device', () => {
    it.each(crossTenantActions)('%s from an unknown socket is rejected', async (_name, action) => {
      const stranger = fx.register(mockSocket('stranger'));
      await action(stranger);
      expect(fx.agentB1.emitted).toHaveLength(0);
      expect(fx.agentA1.emitted).toHaveLength(0);
    });

    it('agents cannot issue teacher commands', async () => {
      const res = await fx.gateway.handleTeacherLockDevice(fx.agentA1 as any, { deviceId: DEVICE_A2 });
      expect(res.success).toBe(false);
      expect(fx.agentA2.emitted).toHaveLength(0);
    });
  });

  describe('S1 · legitimate actions keep working', () => {
    it('lock, file and process commands reach an own device', async () => {
      expect((await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 })).success).toBe(true);
      expect((await fx.gateway.handleTeacherListDir(fx.teacherA as any, { deviceId: DEVICE_A1 })).success).toBe(true);
      expect((await fx.gateway.handleTeacherRequestProcesses(fx.teacherA as any, { deviceId: DEVICE_A1 })).success).toBe(true);
      await fx.gateway.handleTeacherRemoteInput(fx.teacherA as any, { deviceId: DEVICE_A1, type: 'click', x: 5, y: 5 });

      expect(fx.agentA1.received('COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(fx.agentA1.received('FILE_LIST_DIR').length).toBeGreaterThan(0);
      expect(fx.agentA1.received('PROCESS_LIST_REQUEST').length).toBeGreaterThan(0);
      expect(fx.agentA1.received('REMOTE_INPUT_EVENT').length).toBeGreaterThan(0);
    });

    it('teacher B can act on its own device', async () => {
      const res = await fx.gateway.handleTeacherLockDevice(fx.teacherB as any, { deviceId: DEVICE_B1 });
      expect(res.success).toBe(true);
      expect(fx.agentB1.received('COMMAND_DISPATCH').length).toBeGreaterThan(0);
    });

    it('fails closed when the database is unavailable', async () => {
      (db as any).isConnected = false;
      const res = await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });
      expect(res.success).toBe(false);
      expect(fx.agentA1.emitted).toHaveLength(0);
      (db as any).isConnected = true;
    });
  });

  describe('S3 · classroom-wide actions are scoped', () => {
    it('lock classroom without classroomId only reaches devices of the own institution', async () => {
      const res = await fx.gateway.handleTeacherLockClassroom(fx.teacherA as any, {});
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
      expect(fx.agentA1.received('COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(fx.agentA2.received('COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(fx.agentB1.emitted).toHaveLength(0);
    });

    it('lock classroom with classroomId only reaches devices of that classroom', async () => {
      const res = await fx.gateway.handleTeacherLockClassroom(fx.teacherA as any, { classroomId: CLASSROOM_A2 });
      expect(res.count).toBe(1);
      expect(fx.agentA2.received('COMMAND_DISPATCH').length).toBeGreaterThan(0);
      expect(fx.agentA1.emitted).toHaveLength(0);
      expect(fx.agentB1.emitted).toHaveLength(0);
    });

    it('lock/unlock classroom of another institution is rejected', async () => {
      const lock = await fx.gateway.handleTeacherLockClassroom(fx.teacherA as any, { classroomId: CLASSROOM_B1 });
      const unlock = await fx.gateway.handleTeacherUnlockClassroom(fx.teacherA as any, { classroomId: CLASSROOM_B1 });
      expect(lock.success).toBe(false);
      expect(unlock.success).toBe(false);
      expect(fx.agentB1.emitted).toHaveLength(0);
    });

    it('send file to all never reaches another institution', async () => {
      const res = await fx.gateway.handleTeacherSendFile(fx.teacherA as any, {
        broadcastToAll: true,
        fileName: 'tarea.pdf',
        fileSizeBytes: 3,
        fileContentBase64: 'YWJj',
      });
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
      expect(fx.agentB1.emitted).toHaveLength(0);
    });

    it('send file to all in a classroom only reaches that classroom', async () => {
      const res = await fx.gateway.handleTeacherSendFile(fx.teacherA as any, {
        broadcastToAll: true,
        classroomId: CLASSROOM_A1,
        fileName: 'tarea.pdf',
        fileSizeBytes: 3,
        fileContentBase64: 'YWJj',
      });
      expect(res.count).toBe(1);
      expect(fx.agentA1.received('FILE_SEND').length).toBeGreaterThan(0);
      expect(fx.agentA2.emitted).toHaveLength(0);
    });
  });

  describe('S8 · DEVICE_STATUS_CHANGED is scoped to the institution', () => {
    it('teacher B does not learn about status changes of institution A', async () => {
      await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });
      await fx.gateway.handleTeacherLockClassroom(fx.teacherA as any, {});
      expect(fx.teacherA.received('DEVICE_STATUS_CHANGED').length).toBeGreaterThan(0);
      expect(fx.teacherB.received('DEVICE_STATUS_CHANGED')).toHaveLength(0);
      expect(fx.agentA1.received('DEVICE_STATUS_CHANGED')).toHaveLength(0);
      expect((fx.gateway.server.emit as jest.Mock)).not.toHaveBeenCalledWith('DEVICE_STATUS_CHANGED', expect.anything());
    });
  });
});
