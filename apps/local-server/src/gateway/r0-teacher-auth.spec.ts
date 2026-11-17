import { AgentGateway } from './agent.gateway';
import { DatabaseService } from '../database/database.service';
import { REFRESH_TOKEN_TYPE } from '../auth/token-policy';
import {
  CLASSROOM_A1,
  createTestJwtService,
  signTeacherToken,
} from '../../test/gateway-test-helpers';
import { JwtService } from '@nestjs/jwt';

/**
 * R0 — S9: no fallback identity in the gateway; teacher join only with a
 * verified access token, no pending password change and an own classroom.
 */
describe('R0 · S9 — Teacher WebSocket authentication', () => {
  let db: DatabaseService;
  const jwt = createTestJwtService();

  const socket = (id: string) =>
    ({ id, handshake: { address: '10.0.0.5' }, join: jest.fn(), leave: jest.fn(), emit: jest.fn(), disconnect: jest.fn() } as any);

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    db = new DatabaseService();
    await db.onModuleInit();
    await db.query(`UPDATE users SET must_change_password = false WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`);
    await db.query(
      "INSERT INTO institutions (id, code, name, contact_email) VALUES ('bbbbbbbb-0000-0000-0000-00000000000b', 'INST-B', 'Colegio B', 'b@b.edu')",
    );
    await db.query(
      "INSERT INTO classrooms (id, institution_id, name, code) VALUES ('d000000b-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Lab B', 'LAB-B')",
    );
  });

  afterEach(async () => {
    await db.onModuleDestroy();
  });

  it('rejects every teacher when no JwtService is injected (former fallback identity removed)', async () => {
    const gateway = new AgentGateway(db);
    const res = await gateway.handleTeacherJoin(socket('t1'), { token: 'anything', classroomId: CLASSROOM_A1 });
    expect(res.success).toBe(false);
  });

  it('rejects tokens signed with another secret', async () => {
    const gateway = new AgentGateway(db, jwt);
    const forged = new JwtService({ secret: 'x'.repeat(40) });
    const res = await gateway.handleTeacherJoin(socket('t2'), { token: signTeacherToken(forged) });
    expect(res.success).toBe(false);
  });

  it('rejects refresh tokens', async () => {
    const gateway = new AgentGateway(db, jwt);
    const refresh = jwt.sign({ sub: 'cccccccc-cccc-cccc-cccc-cccccccccccc', type: REFRESH_TOKEN_TYPE });
    const res = await gateway.handleTeacherJoin(socket('t3'), { token: refresh });
    expect(res.success).toBe(false);
  });

  it('rejects teachers with a pending mandatory password change (state read from the database)', async () => {
    await db.query(`UPDATE users SET must_change_password = true WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`);
    const gateway = new AgentGateway(db, jwt);
    // Even a token whose claim says "no change pending" is rejected: the DB is the source of truth.
    const res = await gateway.handleTeacherJoin(socket('t4'), {
      token: signTeacherToken(jwt, { mustChangePassword: false }),
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/PASSWORD_CHANGE_REQUIRED/);
  });

  it('accepts a teacher right after changing the password, even with the old token (stale claim)', async () => {
    const gateway = new AgentGateway(db, jwt);
    const res = await gateway.handleTeacherJoin(socket('t4b'), {
      token: signTeacherToken(jwt, { mustChangePassword: true }),
    });
    expect(res.success).toBe(true);
  });

  it('rejects deactivated users', async () => {
    await db.query(`UPDATE users SET is_active = false WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`);
    const gateway = new AgentGateway(db, jwt);
    const res = await gateway.handleTeacherJoin(socket('t4c'), { token: signTeacherToken(jwt) });
    expect(res.success).toBe(false);
  });

  it('rejects joining a classroom of another institution', async () => {
    const gateway = new AgentGateway(db, jwt);
    const s = socket('t5');
    const res = await gateway.handleTeacherJoin(s, {
      token: signTeacherToken(jwt),
      classroomId: 'd000000b-0000-0000-0000-00000000000b',
    });
    expect(res.success).toBe(false);
    expect(s.join).not.toHaveBeenCalled();
  });

  it('accepts a valid access token for an own classroom', async () => {
    const gateway = new AgentGateway(db, jwt);
    const res = await gateway.handleTeacherJoin(socket('t6'), {
      token: signTeacherToken(jwt),
      classroomId: CLASSROOM_A1,
    });
    expect(res.success).toBe(true);
  });
});
