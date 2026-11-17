import { AgentGateway } from './agent.gateway';
import { DatabaseService } from '../database/database.service';
import {
  PacketType,
  createEnvelope,
  AgentHelloPayload,
  ScreenCaptureStartPayload,
  ScreenCaptureStopPayload,
  WebRtcOfferPayload,
  WebRtcAnswerPayload,
  WebRtcIceCandidatePayload,
} from '@assetschool/protocol';
import { DevicePlatform, SystemRole } from '@assetschool/shared-types';
import { createTestJwtService, signTeacherToken } from '../../test/gateway-test-helpers';

describe('WebRTC LAN Signaling & Screen Capture Authorization Tests (Phase 02)', () => {
  let gateway: AgentGateway;
  let dbService: DatabaseService;
  // R0 / S9: real JwtService and real signed access tokens (no fallback identity).
  const jwtService = createTestJwtService();
  const teacherToken = () => signTeacherToken(jwtService);

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    // Seed teacher modelled as having already changed the mandatory password.
    await dbService.query(`UPDATE users SET must_change_password = false WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`);
    gateway = new AgentGateway(dbService, jwtService);
  });

  afterEach(async () => {
    await dbService.onModuleDestroy();
  });

  const createMockSocket = (id: string, ip: string = '192.168.1.150') => {
    const emittedEvents: Array<{ event: string; data: any }> = [];
    const rooms = new Set<string>();
    return {
      id,
      handshake: { address: ip },
      join: jest.fn((r) => rooms.add(r)),
      leave: jest.fn((r) => rooms.delete(r)),
      emit: jest.fn((event, data) => emittedEvents.push({ event, data })),
      disconnect: jest.fn(),
      _emitted: emittedEvents,
      _rooms: rooms,
    } as any;
  };

  it('should reject SCREEN_CAPTURE_START if caller is not authenticated as teacher', async () => {
    const unauthenticatedSocket = createMockSocket('unauth_sock');
    const startEnvelope = createEnvelope(
      PacketType.SCREEN_CAPTURE_START,
      'fake_teacher',
      'server',
      {
        teacherId: 'teacher_123',
        deviceId: '01010101-0101-0101-0101-010101010101',
        sessionId: 'test_stream_01',
        qualityTier: 'thumbnail' as const,
      },
    );

    const response = await gateway.handleScreenCaptureStart(unauthenticatedSocket, startEnvelope);
    expect(response.packetType).toBe(PacketType.WEBRTC_ERROR);
    expect((response.payload as any).code).toBe('UNAUTHORIZED');
  });

  it('should reject SCREEN_CAPTURE_START if device is revoked in PostgreSQL', async () => {
    // 1. Mark device revoked
    await dbService.query(
      "UPDATE devices SET is_revoked = true WHERE id = '01010101-0101-0101-0101-010101010101'",
    );

    // 2. Authenticate teacher socket
    const teacherSocket = createMockSocket('teacher_sock');
    await gateway.handleTeacherJoin(teacherSocket, {
      token: teacherToken(),
      classroomId: 'd1111111-1111-1111-1111-111111111111',
    });

    const startEnvelope = createEnvelope(
      PacketType.SCREEN_CAPTURE_START,
      'teacher_123',
      'server',
      {
        teacherId: 'teacher_123',
        deviceId: '01010101-0101-0101-0101-010101010101',
        sessionId: 'test_stream_02',
        qualityTier: 'thumbnail' as const,
      },
    );

    const response = await gateway.handleScreenCaptureStart(teacherSocket, startEnvelope);
    expect(response.packetType).toBe(PacketType.WEBRTC_ERROR);
    expect((response.payload as any).code).toBe('REVOKED');
  });

  it('should reject SCREEN_CAPTURE_START if device belongs to another institution (Tenant Isolation)', async () => {
    // 1. Insert other institution
    await dbService.query(
      "INSERT INTO institutions (id, code, name, contact_email) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'INST-B', 'Colegio B', 'admin@colegiob.edu')",
    );

    // 2. Device in another institution
    await dbService.query(
      "INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, status) VALUES ('99999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OTHER-PC', 'AA:BB:CC:DD:EE:FF', '192.168.1.99', 'windows', 'Win11', 'x64', 'online')",
    );

    const teacherSocket = createMockSocket('teacher_inst_a');
    await gateway.handleTeacherJoin(teacherSocket, {
      token: teacherToken(),
      classroomId: 'd1111111-1111-1111-1111-111111111111',
    });

    const startEnvelope = createEnvelope(
      PacketType.SCREEN_CAPTURE_START,
      'teacher_inst_a',
      'server',
      {
        teacherId: '33333333-3333-3333-3333-333333333333',
        deviceId: '99999999-9999-9999-9999-999999999999',
        sessionId: 'test_stream_cross_tenant',
        qualityTier: 'thumbnail' as const,
      },
    );

    const response = await gateway.handleScreenCaptureStart(teacherSocket, startEnvelope);
    expect(response.packetType).toBe(PacketType.WEBRTC_ERROR);
    expect((response.payload as any).code).toBe('UNAUTHORIZED');
  });

  it('should establish stream session, forward start to agent, create audit log, and route WebRTC signaling', async () => {
    // 1. Mock Server.sockets.sockets
    const agentSocket = createMockSocket('agent_sock_01', '192.168.1.101');
    const teacherSocket = createMockSocket('teacher_sock_01', '192.168.1.200');

    const socketMap = new Map<string, any>();
    socketMap.set(agentSocket.id, agentSocket);
    socketMap.set(teacherSocket.id, teacherSocket);

    gateway.server = {
      sockets: {
        sockets: socketMap,
      },
    } as any;

    // 2. Connect and authenticate agent
    const agentDeviceId = '01010101-0101-0101-0101-010101010101';
    await gateway.handleAgentHello(
      agentSocket,
      createEnvelope(PacketType.AGENT_HELLO, agentDeviceId, 'agent', {
        hostname: 'LAB01-PC-01',
        macAddress: '02:42:AC:11:00:02',
        localIp: '192.168.1.101',
        osType: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11',
        architecture: 'x64',
        agentVersion: '1.0.0',
        publicKey: 'mock_key',
        enrolledDeviceId: agentDeviceId,
      }),
    );

    // 3. Connect teacher
    await gateway.handleTeacherJoin(teacherSocket, {
      token: teacherToken(),
      classroomId: 'd1111111-1111-1111-1111-111111111111',
    });

    // 4. Teacher starts screen capture
    const sessionId = 'stream_test_session_100';
    const startEnvelope = createEnvelope(
      PacketType.SCREEN_CAPTURE_START,
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'server',
      {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId,
        qualityTier: 'thumbnail' as const,
        targetFps: 10,
        targetBitrateKbps: 250,
      },
    );

    const startRes = await gateway.handleScreenCaptureStart(teacherSocket, startEnvelope);
    expect(startRes.packetType).toBe(PacketType.WEBRTC_SESSION_CREATED);
    expect((startRes.payload as any).sessionId).toBe(sessionId);
    expect(gateway.getActiveStreamsCount()).toBe(1);

    // Verify agent received SCREEN_CAPTURE_START
    const agentStartPkt = agentSocket._emitted.find((e: any) => e.event === PacketType.SCREEN_CAPTURE_START);
    expect(agentStartPkt).toBeDefined();
    expect(agentStartPkt.data.payload.qualityTier).toBe('thumbnail');

    // Verify PostgreSQL audit_logs has SCREEN_CAPTURE_START
    const auditRes = await dbService.query(
      "SELECT * FROM audit_logs WHERE action = 'SCREEN_CAPTURE_START' AND entity_id = $1",
      [agentDeviceId],
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
    expect(auditRes.rows[0].entity_type).toBe('DEVICE');

    // 5. Test WebRTC Signaling: Agent sends Offer -> routed to Teacher
    const offerEnvelope = createEnvelope(
      PacketType.WEBRTC_OFFER,
      agentDeviceId,
      'agent',
      {
        sessionId,
        targetDeviceId: agentDeviceId,
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        sdp: 'v=0\r\no=agent 12345 2 IN IP4 192.168.1.101\r\ns=AssetSchool LAN Stream\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96',
        qualityTier: 'thumbnail' as const,
      },
    );
    gateway.handleWebRtcOffer(agentSocket, offerEnvelope);

    const teacherOfferPkt = teacherSocket._emitted.find((e: any) => e.event === PacketType.WEBRTC_OFFER);
    expect(teacherOfferPkt).toBeDefined();
    expect(teacherOfferPkt.data.payload.sdp).toContain('AssetSchool LAN Stream');

    // 6. Teacher sends Answer -> routed to Agent
    const answerEnvelope = createEnvelope(
      PacketType.WEBRTC_ANSWER,
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'server',
      {
        sessionId,
        deviceId: agentDeviceId,
        targetTeacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        sdp: 'v=0\r\no=teacher 54321 2 IN IP4 192.168.1.200\r\ns=AssetSchool LAN Receiver\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96',
      },
    );
    gateway.handleWebRtcAnswer(teacherSocket, answerEnvelope);

    const agentAnswerPkt = agentSocket._emitted.find((e: any) => e.event === PacketType.WEBRTC_ANSWER);
    expect(agentAnswerPkt).toBeDefined();
    expect(agentAnswerPkt.data.payload.sdp).toContain('AssetSchool LAN Receiver');

    // 7. ICE Candidate exchange
    const iceEnvelope = createEnvelope(
      PacketType.WEBRTC_ICE_CANDIDATE,
      agentDeviceId,
      'agent',
      {
        sessionId,
        senderId: agentDeviceId,
        targetId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        candidate: {
          candidate: 'candidate:1 1 UDP 2130706431 192.168.1.101 50000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      },
    );
    gateway.handleIceCandidate(agentSocket, iceEnvelope);

    const teacherIcePkt = teacherSocket._emitted.find((e: any) => e.event === PacketType.WEBRTC_ICE_CANDIDATE);
    expect(teacherIcePkt).toBeDefined();
    expect(teacherIcePkt.data.payload.candidate.candidate).toContain('192.168.1.101');

    // 8. Stream Stats telemetry routing
    const statsEnvelope = createEnvelope(
      PacketType.SCREEN_STREAM_STATS,
      agentDeviceId,
      'agent',
      {
        sessionId,
        deviceId: agentDeviceId,
        fps: 10,
        bitrateKbps: 245,
        packetLossPercent: 0,
        roundTripTimeMs: 2.4,
        resolution: '640x360',
        timestamp: Date.now(),
      },
    );
    gateway.handleStreamStats(agentSocket, statsEnvelope);

    const teacherStatsPkt = teacherSocket._emitted.find((e: any) => e.event === PacketType.SCREEN_STREAM_STATS);
    expect(teacherStatsPkt).toBeDefined();
    expect(teacherStatsPkt.data.payload.bitrateKbps).toBe(245);

    // 9. Stop Capture: Teacher requests stop
    const stopEnvelope = createEnvelope(
      PacketType.SCREEN_CAPTURE_STOP,
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'server',
      {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId,
        reason: 'Fin de supervisión de clase',
      },
    );
    await gateway.handleScreenCaptureStop(teacherSocket, stopEnvelope);

    expect(gateway.getActiveStreamsCount()).toBe(0);

    // Verify both sides got WEBRTC_SESSION_CLOSED
    const agentClosedPkt = agentSocket._emitted.find((e: any) => e.event === PacketType.WEBRTC_SESSION_CLOSED);
    const teacherClosedPkt = teacherSocket._emitted.find((e: any) => e.event === PacketType.WEBRTC_SESSION_CLOSED);
    expect(agentClosedPkt).toBeDefined();
    expect(teacherClosedPkt).toBeDefined();

    // Verify audit log has SCREEN_CAPTURE_STOP
    const auditStopRes = await dbService.query(
      "SELECT * FROM audit_logs WHERE action = 'SCREEN_CAPTURE_STOP' AND entity_id = $1",
      [agentDeviceId],
    );
    expect(auditStopRes.rows.length).toBeGreaterThan(0);
  });

  it('should terminate active screen stream immediately when device is revoked dynamically', async () => {
    const agentSocket = createMockSocket('agent_sock_rev');
    const teacherSocket = createMockSocket('teacher_sock_rev');

    gateway.server = {
      sockets: {
        sockets: new Map([
          [agentSocket.id, agentSocket],
          [teacherSocket.id, teacherSocket],
        ]),
      },
    } as any;

    const agentDeviceId = '01010101-0101-0101-0101-010101010101';
    await gateway.handleAgentHello(
      agentSocket,
      createEnvelope(PacketType.AGENT_HELLO, agentDeviceId, 'agent', {
        hostname: 'LAB01-PC-01',
        macAddress: '02:42:AC:11:00:02',
        localIp: '192.168.1.101',
        osType: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11',
        architecture: 'x64',
        agentVersion: '1.0.0',
        publicKey: 'mock_key',
        enrolledDeviceId: agentDeviceId,
      }),
    );

    await gateway.handleTeacherJoin(teacherSocket, {
      token: teacherToken(),
      classroomId: 'd1111111-1111-1111-1111-111111111111',
    });

    const sessionId = 'stream_revocation_test';
    await gateway.handleScreenCaptureStart(
      teacherSocket,
      createEnvelope(PacketType.SCREEN_CAPTURE_START, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'server', {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId,
        qualityTier: 'individual' as const,
      }),
    );
    expect(gateway.getActiveStreamsCount()).toBe(1);

    // Trigger revocation termination
    gateway.terminateDeviceStreams(agentDeviceId, 'Dispositivo revocado por el administrador');
    expect(gateway.getActiveStreamsCount()).toBe(0);

    const closedNotice = teacherSocket._emitted.find((e: any) => e.event === PacketType.WEBRTC_SESSION_CLOSED);
    expect(closedNotice).toBeDefined();
    expect(closedNotice.data.payload.reason).toContain('revocado');
  });

  it('should terminate active stream immediately when agent disconnects unexpectedly and allow reconnection', async () => {
    const agentSocket = createMockSocket('agent_sock_disc');
    const teacherSocket = createMockSocket('teacher_sock_disc');

    const socketMap = new Map<string, any>([
      [agentSocket.id, agentSocket],
      [teacherSocket.id, teacherSocket],
    ]);

    gateway.server = {
      sockets: {
        sockets: socketMap,
      },
    } as any;

    const agentDeviceId = '02020202-0202-0202-0202-020202020202';
    await gateway.handleAgentHello(
      agentSocket,
      createEnvelope(PacketType.AGENT_HELLO, agentDeviceId, 'agent', {
        hostname: 'LAB01-MAC-02',
        macAddress: '02:42:AC:11:00:03',
        localIp: '192.168.1.102',
        osType: DevicePlatform.MACOS,
        osVersion: 'macOS 15',
        architecture: 'arm64',
        agentVersion: '1.0.0',
        publicKey: 'mock_key',
        enrolledDeviceId: agentDeviceId,
      }),
    );

    await gateway.handleTeacherJoin(teacherSocket, {
      token: teacherToken(),
      classroomId: 'd1111111-1111-1111-1111-111111111111',
    });

    const sessionId = 'stream_disconnect_test';
    await gateway.handleScreenCaptureStart(
      teacherSocket,
      createEnvelope(PacketType.SCREEN_CAPTURE_START, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'server', {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId,
        qualityTier: 'thumbnail' as const,
      }),
    );
    expect(gateway.getActiveStreamsCount()).toBe(1);

    // Agent disconnects unexpectedly
    gateway.handleDisconnect(agentSocket);
    expect(gateway.getActiveStreamsCount()).toBe(0);

    const teacherNotification = teacherSocket._emitted.find(
      (e: any) => e.event === PacketType.WEBRTC_SESSION_CLOSED && e.data.payload.reason.includes('desconect'),
    );
    expect(teacherNotification).toBeDefined();

    // Agent reconnects with new socket
    const agentSocketNew = createMockSocket('agent_sock_reconnected');
    socketMap.set(agentSocketNew.id, agentSocketNew);

    const helloAck = await gateway.handleAgentHello(
      agentSocketNew,
      createEnvelope(PacketType.AGENT_HELLO, agentDeviceId, 'agent', {
        hostname: 'LAB01-MAC-02',
        macAddress: '02:42:AC:11:00:03',
        localIp: '192.168.1.102',
        osType: DevicePlatform.MACOS,
        osVersion: 'macOS 15',
        architecture: 'arm64',
        agentVersion: '1.0.0',
        publicKey: 'mock_key',
        enrolledDeviceId: agentDeviceId,
      }),
    );
    expect(helloAck.packetType).toBe(PacketType.SERVER_HELLO_ACK);
    expect((helloAck.payload as any).isEnrolled).toBe(true);
  });

  it('should gracefully handle second stream start by updating active session without resource leak', async () => {
    const agentSocket = createMockSocket('agent_sock_double');
    const teacherSocket = createMockSocket('teacher_sock_double');

    gateway.server = {
      sockets: {
        sockets: new Map([
          [agentSocket.id, agentSocket],
          [teacherSocket.id, teacherSocket],
        ]),
      },
    } as any;

    const agentDeviceId = '01010101-0101-0101-0101-010101010101';
    await gateway.handleAgentHello(
      agentSocket,
      createEnvelope(PacketType.AGENT_HELLO, agentDeviceId, 'agent', {
        hostname: 'LAB01-PC-01',
        macAddress: '02:42:AC:11:00:02',
        localIp: '192.168.1.101',
        osType: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11',
        architecture: 'x64',
        agentVersion: '1.0.0',
        publicKey: 'mock_key',
        enrolledDeviceId: agentDeviceId,
      }),
    );

    await gateway.handleTeacherJoin(teacherSocket, {
      token: teacherToken(),
      classroomId: 'd1111111-1111-1111-1111-111111111111',
    });

    // Start 1st stream
    await gateway.handleScreenCaptureStart(
      teacherSocket,
      createEnvelope(PacketType.SCREEN_CAPTURE_START, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'server', {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId: 'session_01',
        qualityTier: 'thumbnail' as const,
      }),
    );
    expect(gateway.getActiveStreamsCount()).toBe(1);

    // Stop 1st stream cleanly before starting incompatible individual stream
    await gateway.handleScreenCaptureStop(
      teacherSocket,
      createEnvelope(PacketType.SCREEN_CAPTURE_STOP, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'server', {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId: 'session_01',
        reason: 'Switching to full individual resolution',
      }),
    );
    expect(gateway.getActiveStreamsCount()).toBe(0);

    // Start 2nd stream
    const res2 = await gateway.handleScreenCaptureStart(
      teacherSocket,
      createEnvelope(PacketType.SCREEN_CAPTURE_START, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'server', {
        teacherId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        deviceId: agentDeviceId,
        sessionId: 'session_02',
        qualityTier: 'individual' as const,
      }),
    );
    expect(res2.packetType).toBe(PacketType.WEBRTC_SESSION_CREATED);
    expect(gateway.getActiveStreamsCount()).toBe(1);
  });
});
