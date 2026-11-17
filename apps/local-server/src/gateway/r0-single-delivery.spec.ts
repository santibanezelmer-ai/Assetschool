import { PacketType, createEnvelope } from '@assetschool/protocol';
import { DatabaseService } from '../database/database.service';
import { buildTwoTenantFixture, DEVICE_A1 } from '../../test/isolation-fixture';

/**
 * R0 follow-up — every command / request / signaling message is delivered
 * exactly ONCE to its recipient. Previously the gateway emitted
 * PacketType.X and the string 'X' (same event name), so agents executed each
 * command twice; WebRTC messages were also duplicated under SIGNAL_* aliases,
 * which the macOS agent handles as well (double SDP answer / ICE processing).
 */
describe('R0 · Single delivery of commands and signaling', () => {
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

  const count = (s: any, event: string) => s.received(event).length;

  it('each teacher action reaches the agent exactly once', async () => {
    await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });
    expect(count(fx.agentA1, 'COMMAND_DISPATCH')).toBe(1);

    await fx.gateway.handleTeacherListDir(fx.teacherA as any, { deviceId: DEVICE_A1 });
    expect(count(fx.agentA1, 'FILE_LIST_DIR')).toBe(1);

    await fx.gateway.handleTeacherSendFile(fx.teacherA as any, {
      deviceId: DEVICE_A1, fileName: 'a.txt', fileSizeBytes: 1, fileContentBase64: 'YQ==',
    });
    expect(count(fx.agentA1, 'FILE_SEND')).toBe(1);

    await fx.gateway.handleTeacherSendFile(fx.teacherA as any, {
      broadcastToAll: true, fileName: 'b.txt', fileSizeBytes: 1, fileContentBase64: 'Yg==',
    });
    expect(count(fx.agentA1, 'FILE_SEND')).toBe(2); // one per send, not two
    expect(count(fx.agentA2, 'FILE_SEND')).toBe(1);

    await fx.gateway.handleTeacherCollectFile(fx.teacherA as any, { deviceId: DEVICE_A1, filePath: 'a.txt' });
    expect(count(fx.agentA1, 'FILE_COLLECT')).toBe(1);

    await fx.gateway.handleTeacherRequestProcesses(fx.teacherA as any, { deviceId: DEVICE_A1 });
    expect(count(fx.agentA1, 'PROCESS_LIST_REQUEST')).toBe(1);

    await fx.gateway.handleTeacherKillProcess(fx.teacherA as any, { deviceId: DEVICE_A1, pid: 7 });
    expect(count(fx.agentA1, 'KILL_PROCESS')).toBe(1);

    await fx.gateway.handleTeacherRemoteInput(fx.teacherA as any, { deviceId: DEVICE_A1, type: 'click', x: 1, y: 1 });
    expect(count(fx.agentA1, 'REMOTE_INPUT_EVENT')).toBe(1);
  });

  it('WebRTC offer / answer / ICE are delivered once (no SIGNAL_* duplicate)', async () => {
    const start = await fx.gateway.handleScreenCaptureStart(
      fx.teacherA as any,
      createEnvelope(PacketType.SCREEN_CAPTURE_START, 't', 'server', {
        teacherId: 't', deviceId: DEVICE_A1, sessionId: 'single_delivery', qualityTier: 'thumbnail' as const,
      }),
    );
    expect(start.packetType).toBe(PacketType.WEBRTC_SESSION_CREATED);
    fx.resetTraffic();

    const sig = (type: PacketType, payload: any) => createEnvelope(type, 'x', 'server', payload as any);

    fx.gateway.handleWebRtcOffer(fx.agentA1 as any, sig(PacketType.WEBRTC_OFFER, { sessionId: 'single_delivery', sdp: 'v=0' }));
    fx.gateway.handleWebRtcAnswer(fx.teacherA as any, sig(PacketType.WEBRTC_ANSWER, { sessionId: 'single_delivery', sdp: 'v=0' }));
    fx.gateway.handleIceCandidate(fx.agentA1 as any, sig(PacketType.WEBRTC_ICE_CANDIDATE, { sessionId: 'single_delivery', candidate: 'c' }));
    fx.gateway.handleIceCandidate(fx.teacherA as any, sig(PacketType.WEBRTC_ICE_CANDIDATE, { sessionId: 'single_delivery', candidate: 'c' }));

    const total = (s: any) => s.emitted.length;
    expect(count(fx.teacherA, 'WEBRTC_OFFER')).toBe(1);
    expect(count(fx.agentA1, 'WEBRTC_ANSWER')).toBe(1);
    expect(count(fx.teacherA, 'WEBRTC_ICE_CANDIDATE')).toBe(1);
    expect(count(fx.agentA1, 'WEBRTC_ICE_CANDIDATE')).toBe(1);
    expect(total(fx.teacherA)).toBe(2);
    expect(total(fx.agentA1)).toBe(2);
  });

  it('legacy SIGNAL_* messages are still accepted from clients and routed once', async () => {
    await fx.gateway.handleScreenCaptureStart(
      fx.teacherA as any,
      createEnvelope(PacketType.SCREEN_CAPTURE_START, 't', 'server', {
        teacherId: 't', deviceId: DEVICE_A1, sessionId: 'legacy_alias', qualityTier: 'thumbnail' as const,
      }),
    );
    fx.resetTraffic();
    fx.gateway.handleSignalSdpOffer(
      fx.agentA1 as any,
      createEnvelope(PacketType.SIGNAL_SDP_OFFER, 'x', 'server', { sessionId: 'legacy_alias', sdp: 'v=0' } as any),
    );
    expect(count(fx.teacherA, 'WEBRTC_OFFER')).toBe(1);
    expect(fx.teacherA.emitted).toHaveLength(1);
  });
});
