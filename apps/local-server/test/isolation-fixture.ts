import { PacketType, createEnvelope } from '@assetschool/protocol';
import { DevicePlatform, SystemRole } from '@assetschool/shared-types';
import { AgentGateway } from '../src/gateway/agent.gateway';
import { DatabaseService } from '../src/database/database.service';
import { createTestJwtService, signTeacherToken, INSTITUTION_A, CLASSROOM_A1 } from './gateway-test-helpers';

export const INSTITUTION_B = 'bbbbbbbb-0000-0000-0000-00000000000b';
export const CLASSROOM_A2 = 'd2222222-2222-2222-2222-222222222222';
export const CLASSROOM_B1 = 'd000000b-0000-0000-0000-00000000000b';
export const TEACHER_B_ID = 'cccccccc-0000-0000-0000-00000000000b';

export const DEVICE_A1 = '01010101-0101-0101-0101-010101010101'; // seed, classroom A1
export const DEVICE_A2 = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'; // classroom A2
export const DEVICE_B1 = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b'; // institution B

export interface MockSocket {
  id: string;
  handshake: { address: string };
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  emitted: Array<{ event: string; data: any }>;
  received(event: string): any[];
}

export function mockSocket(id: string, ip = '10.0.0.10'): MockSocket {
  const emitted: Array<{ event: string; data: any }> = [];
  return {
    id,
    handshake: { address: ip },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn((event: string, data: any) => emitted.push({ event, data })),
    disconnect: jest.fn(),
    emitted,
    received: (event: string) => emitted.filter((e) => e.event === event).map((e) => e.data),
  };
}

/**
 * Two institutions (A = seed, B = created here), one teacher per institution
 * and three connected agents (A1, A2 in institution A, B1 in institution B).
 */
export async function buildTwoTenantFixture(db: DatabaseService) {
  await db.query(
    `INSERT INTO institutions (id, code, name, contact_email) VALUES ($1, 'INST-B', 'Colegio B', 'b@b.edu')`,
    [INSTITUTION_B],
  );
  await db.query(
    `INSERT INTO classrooms (id, institution_id, name, code) VALUES ($1, $2, 'Lab B', 'LAB-B')`,
    [CLASSROOM_B1, INSTITUTION_B],
  );
  await db.query(
    `INSERT INTO users (id, institution_id, role_id, email, password_hash, first_name, last_name)
     VALUES ($1, $2, '33333333-3333-3333-3333-333333333333', 'profesor@colegiob.edu', 'x', 'Prof', 'B')`,
    [TEACHER_B_ID, INSTITUTION_B],
  );
  await db.query(
    `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, status, current_classroom_id)
     VALUES ($1, $2, 'LAB02-PC-01', '02:42:AC:11:00:0A', '10.0.0.21', 'windows', 'Win11', 'x64', 'offline', $3)`,
    [DEVICE_A2, INSTITUTION_A, CLASSROOM_A2],
  );
  await db.query(
    `INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, status, current_classroom_id)
     VALUES ($1, $2, 'COLB-PC-01', '02:42:AC:11:00:0B', '10.0.0.31', 'windows', 'Win11', 'x64', 'offline', $3)`,
    [DEVICE_B1, INSTITUTION_B, CLASSROOM_B1],
  );

  // The seed teacher has a pending mandatory password change; the fixture models
  // a teacher who already changed it (the gateway reads this flag from the DB).
  await db.query(`UPDATE users SET must_change_password = false WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`);

  const jwt = createTestJwtService();
  const gateway = new AgentGateway(db, jwt);

  const sockets = new Map<string, MockSocket>();
  const register = (s: MockSocket) => {
    sockets.set(s.id, s);
    return s;
  };
  gateway.server = {
    sockets: { sockets },
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  } as any;

  const agentA1 = register(mockSocket('agent-a1', '10.0.0.11'));
  const agentA2 = register(mockSocket('agent-a2', '10.0.0.21'));
  const agentB1 = register(mockSocket('agent-b1', '10.0.0.31'));

  const hello = (s: MockSocket, mac: string, hostname: string) =>
    gateway.handleAgentHello(
      s as any,
      createEnvelope(PacketType.AGENT_HELLO, hostname, 'agent', {
        hostname,
        macAddress: mac,
        localIp: s.handshake.address,
        osType: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11',
        architecture: 'x64',
        agentVersion: '1.0.0',
        publicKey: 'n/a',
      }),
    );
  await hello(agentA1, '02:42:AC:11:00:02', 'LAB01-PC-01');
  await hello(agentA2, '02:42:AC:11:00:0A', 'LAB02-PC-01');
  await hello(agentB1, '02:42:AC:11:00:0B', 'COLB-PC-01');

  const teacherA = register(mockSocket('teacher-a', '10.0.0.100'));
  const teacherB = register(mockSocket('teacher-b', '10.0.0.200'));
  const joinA = await gateway.handleTeacherJoin(teacherA as any, { token: signTeacherToken(jwt) });
  const joinB = await gateway.handleTeacherJoin(teacherB as any, {
    token: signTeacherToken(jwt, {
      sub: TEACHER_B_ID,
      email: 'profesor@colegiob.edu',
      institutionId: INSTITUTION_B,
      role: SystemRole.TEACHER,
    }),
  });
  if (!joinA.success || !joinB.success) {
    throw new Error(`Fixture join failed: ${JSON.stringify({ joinA, joinB })}`);
  }

  /** Clears captured emissions so each assertion only sees new traffic. */
  const resetTraffic = () => {
    for (const s of sockets.values()) {
      s.emitted.length = 0;
      s.emit.mockClear();
    }
  };
  resetTraffic();

  return { gateway, jwt, sockets, register, agentA1, agentA2, agentB1, teacherA, teacherB, resetTraffic, CLASSROOM_A1 };
}
