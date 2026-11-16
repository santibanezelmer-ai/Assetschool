import { PacketType, createEnvelope } from '@assetschool/protocol';
import { DatabaseService } from '../database/database.service';
import { buildTwoTenantFixture, DEVICE_A1, DEVICE_B1, mockSocket } from '../../test/isolation-fixture';
import { signTeacherToken } from '../../test/gateway-test-helpers';

/**
 * R0 — S2: agent results are delivered only to the requesting teacher and only
 * accepted from the enrolled agent; stream control events cannot be spoofed.
 */
describe('R0 · S2 — Agent result routing and anti-spoofing', () => {
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

  const everyoneExcept = (...allowed: any[]) =>
    Array.from(fx.sockets.values()).filter((s) => !allowed.includes(s));

  const resultEnvelope = (type: string, payload: any) =>
    createEnvelope(type as any, DEVICE_A1, 'server' as any, payload);

  it('FILE_COLLECT_RESULT (student file content) reaches only the requesting teacher', async () => {
    await fx.gateway.handleTeacherCollectFile(fx.teacherA as any, { deviceId: DEVICE_A1, filePath: 'tarea.docx' });
    const collectId = fx.agentA1.received('FILE_COLLECT')[0].payload.collectId;
    fx.resetTraffic();

    fx.gateway.handleFileCollectResult(
      fx.agentA1 as any,
      resultEnvelope('FILE_COLLECT_RESULT', { collectId, fileName: 'tarea.docx', fileContentBase64: 'U0VDUkVUTw==', success: true }),
    );

    expect(fx.teacherA.received('FILE_COLLECT_RESULT')).toHaveLength(1);
    for (const other of everyoneExcept(fx.teacherA)) {
      expect(other.received('FILE_COLLECT_RESULT')).toHaveLength(0);
    }
    expect(fx.gateway.server.emit as jest.Mock).not.toHaveBeenCalled();
  });

  it('FILE_LIST_DIR_RESULT with an unknown requestId is dropped', async () => {
    await fx.gateway.handleTeacherListDir(fx.teacherA as any, { deviceId: DEVICE_A1 });
    fx.resetTraffic();
    fx.gateway.handleFileListDirResult(
      fx.agentA1 as any,
      resultEnvelope('FILE_LIST_DIR_RESULT', { requestId: 'not-the-real-id', items: [] }),
    );
    for (const s of fx.sockets.values()) expect(s.received('FILE_LIST_DIR_RESULT')).toHaveLength(0);
  });

  it('unsolicited results are dropped', async () => {
    fx.gateway.handleProcessListResult(fx.agentA1 as any, resultEnvelope('PROCESS_LIST_RESULT', { processes: [] }));
    fx.gateway.handleFileSendResult(fx.agentA1 as any, resultEnvelope('FILE_SEND_RESULT', { transferId: 'x', success: true }));
    for (const s of fx.sockets.values()) {
      expect(s.received('PROCESS_LIST_RESULT')).toHaveLength(0);
      expect(s.received('FILE_SEND_RESULT')).toHaveLength(0);
    }
  });

  it('results forged by non-agents or by another agent are dropped', async () => {
    await fx.gateway.handleTeacherCollectFile(fx.teacherA as any, { deviceId: DEVICE_A1, filePath: 'a.txt' });
    const collectId = fx.agentA1.received('FILE_COLLECT')[0].payload.collectId;
    fx.resetTraffic();

    const forged = resultEnvelope('FILE_COLLECT_RESULT', { collectId, deviceId: DEVICE_A1, fileContentBase64: 'RkFLRQ==' });
    fx.gateway.handleFileCollectResult(fx.teacherB as any, forged);
    fx.gateway.handleFileCollectResult(fx.register(mockSocket('stranger')) as any, forged);
    fx.gateway.handleFileCollectResult(fx.agentB1 as any, forged);

    expect(fx.teacherA.received('FILE_COLLECT_RESULT')).toHaveLength(0);
  });

  it('process list results go only to the requester and carry the server-side deviceId', async () => {
    const teacherA2 = fx.register(mockSocket('teacher-a2'));
    await fx.gateway.handleTeacherJoin(teacherA2 as any, { token: signTeacherToken(fx.jwt) });
    await fx.gateway.handleTeacherRequestProcesses(fx.teacherA as any, { deviceId: DEVICE_A1 });
    fx.resetTraffic();

    fx.gateway.handleProcessListResult(
      fx.agentA1 as any,
      resultEnvelope('PROCESS_LIST_RESULT', { deviceId: DEVICE_B1, processes: [{ pid: 1, name: 'x' }] }),
    );

    const delivered = fx.teacherA.received('PROCESS_LIST_RESULT');
    expect(delivered).toHaveLength(1);
    expect(delivered[0].deviceId).toBe(DEVICE_A1);
    expect(teacherA2.received('PROCESS_LIST_RESULT')).toHaveLength(0);
    expect(fx.teacherB.received('PROCESS_LIST_RESULT')).toHaveLength(0);

    // A second (replayed) result is not delivered again.
    fx.gateway.handleProcessListResult(fx.agentA1 as any, resultEnvelope('PROCESS_LIST_RESULT', { processes: [] }));
    expect(fx.teacherA.received('PROCESS_LIST_RESULT')).toHaveLength(1);
  });

  it('COMMAND_RESULT is only accepted from the agent of the command device', async () => {
    await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });
    const commandId = fx.agentA1.received('COMMAND_DISPATCH')[0].payload.commandId;
    await new Promise((r) => setTimeout(r, 20)); // command insert is fire-and-forget

    const forged = createEnvelope(PacketType.COMMAND_RESULT, 'x', 'server', { commandId, success: false, error: 'forged' } as any);
    await fx.gateway.handleCommandResult(fx.agentB1 as any, forged);
    await fx.gateway.handleCommandResult(fx.teacherB as any, forged);
    let row = (await db.query('SELECT status FROM commands WHERE id = $1', [commandId])).rows[0];
    expect(row.status).toBe('SENT');

    await fx.gateway.handleCommandResult(
      fx.agentA1 as any,
      createEnvelope(PacketType.COMMAND_RESULT, 'x', 'server', { commandId, success: true } as any),
    );
    row = (await db.query('SELECT status FROM commands WHERE id = $1', [commandId])).rows[0];
    expect(row.status).not.toBe('SENT');
  });

  describe('stream control events cannot be spoofed', () => {
    const start = async () => {
      const res = await fx.gateway.handleScreenCaptureStart(
        fx.teacherA as any,
        createEnvelope(PacketType.SCREEN_CAPTURE_START, 'teacher', 'server', {
          teacherId: 'x',
          deviceId: DEVICE_A1,
          sessionId: 'stream_s2',
          qualityTier: 'thumbnail' as const,
        }),
      );
      expect(res.packetType).toBe(PacketType.WEBRTC_SESSION_CREATED);
      fx.resetTraffic();
    };

    it('a stranger cannot stop a stream', async () => {
      await start();
      const res = await fx.gateway.handleScreenCaptureStop(
        fx.teacherB as any,
        createEnvelope(PacketType.SCREEN_CAPTURE_STOP, 'x', 'server', { sessionId: 'stream_s2' } as any),
      );
      expect((res.payload as any).stopped).toBe(false);
      expect(fx.gateway.getActiveStreamsCount()).toBe(1);
    });

    it('a stranger cannot tear a stream down with a fake WEBRTC_ERROR', async () => {
      await start();
      fx.gateway.handleWebRtcError(
        fx.agentB1 as any,
        createEnvelope(PacketType.WEBRTC_ERROR, 'x', 'server', { sessionId: 'stream_s2', code: 'UNKNOWN', message: 'x' } as any),
      );
      expect(fx.gateway.getActiveStreamsCount()).toBe(1);
    });

    it('stats and status from a stranger are not relayed to the teacher', async () => {
      await start();
      fx.gateway.handleStreamStats(
        fx.agentB1 as any,
        createEnvelope(PacketType.SCREEN_STREAM_STATS, 'x', 'server', { sessionId: 'stream_s2' } as any),
      );
      fx.gateway.handleScreenCaptureStatus(
        fx.agentB1 as any,
        createEnvelope(PacketType.SCREEN_CAPTURE_STATUS, 'x', 'server', { activeSessionId: 'stream_s2', isCapturing: false } as any),
      );
      expect(fx.teacherA.emitted).toHaveLength(0);
    });

    it('the owning teacher can still stop the stream', async () => {
      await start();
      const res = await fx.gateway.handleScreenCaptureStop(
        fx.teacherA as any,
        createEnvelope(PacketType.SCREEN_CAPTURE_STOP, 'x', 'server', { sessionId: 'stream_s2' } as any),
      );
      expect((res.payload as any).stopped).toBe(true);
      expect(fx.gateway.getActiveStreamsCount()).toBe(0);
    });
  });
});
