import { AgentGateway } from './agent.gateway';
import { DatabaseService } from '../database/database.service';
import {
  PacketType,
  createEnvelope,
  AgentHelloPayload,
  CapabilitiesReportPayload,
} from '@assetschool/protocol';
import { DevicePlatform } from '@assetschool/shared-types';

describe('AgentGateway WebSocket Security & Lifecycle Tests', () => {
  let gateway: AgentGateway;
  let dbService: DatabaseService;

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    gateway = new AgentGateway(dbService);
  });

  afterEach(async () => {
    await dbService.onModuleDestroy();
  });

  const createMockSocket = (id: string) =>
    ({
      id,
      handshake: { address: '192.168.1.101' },
      disconnect: jest.fn(),
    } as any);

  it('should authenticate enrolled agent on AGENT_HELLO and issue session token', async () => {
    const socket = createMockSocket('sock_test_01');
    const helloPayload: AgentHelloPayload = {
      hostname: 'LAB01-PC-01',
      macAddress: '02:42:AC:11:00:02',
      localIp: '192.168.1.101',
      osType: DevicePlatform.WINDOWS,
      osVersion: 'Windows 11 Pro',
      architecture: 'x86_64',
      agentVersion: '1.0.0',
      publicKey: 'ssh-ed25519-mock-key-01',
      enrolledDeviceId: '01010101-0101-0101-0101-010101010101',
    };

    const envelope = createEnvelope(PacketType.AGENT_HELLO, '01010101-0101-0101-0101-010101010101', 'agent', helloPayload);
    const response = await gateway.handleAgentHello(socket, envelope);

    expect(response.packetType).toBe(PacketType.SERVER_HELLO_ACK);
    const ackPayload = response.payload as any;
    expect(ackPayload.isEnrolled).toBe(true);
    expect(ackPayload.sessionToken).toBeDefined();
    expect(ackPayload.heartbeatIntervalMs).toBe(15000);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('should disconnect and reject handshake if device is revoked in database', async () => {
    // 1. Mark device as revoked in database
    await dbService.query(
      "UPDATE devices SET is_revoked = true WHERE mac_address = '02:42:AC:11:00:02'",
    );

    const socket = createMockSocket('sock_test_revoked');
    const helloPayload: AgentHelloPayload = {
      hostname: 'LAB01-PC-01',
      macAddress: '02:42:AC:11:00:02',
      localIp: '192.168.1.101',
      osType: DevicePlatform.WINDOWS,
      osVersion: 'Windows 11 Pro',
      architecture: 'x86_64',
      agentVersion: '1.0.0',
      publicKey: 'ssh-ed25519-mock-key-01',
    };

    const envelope = createEnvelope(PacketType.AGENT_HELLO, 'REVOKED', 'agent', helloPayload);
    const response = await gateway.handleAgentHello(socket, envelope);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect((response.payload as any).error).toBeDefined();
  });

  it('should process heartbeat ping for active session and return pong', async () => {
    const socket = createMockSocket('sock_test_02');
    // First hello
    await gateway.handleAgentHello(
      socket,
      createEnvelope(PacketType.AGENT_HELLO, 'PC-02', 'agent', {
        hostname: 'LAB01-MAC-02',
        macAddress: '02:42:AC:11:00:03',
        localIp: '192.168.1.102',
        osType: DevicePlatform.MACOS,
        osVersion: 'macOS Sonoma',
        architecture: 'arm64',
        agentVersion: '1.0.0',
        publicKey: 'mock_key_02',
      }),
    );

    const pingEnvelope = createEnvelope(PacketType.HEARTBEAT_PING, 'sock_test_02', 'agent', {
      timestamp: Date.now(),
    });
    const pongResponse = gateway.handleHeartbeat(socket, pingEnvelope);

    expect(pongResponse.packetType).toBe(PacketType.HEARTBEAT_PONG);
    expect((pongResponse.payload as any).serverTime).toBeGreaterThan(0);
  });
});
