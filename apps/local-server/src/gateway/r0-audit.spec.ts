import { DatabaseService } from '../database/database.service';
import { buildTwoTenantFixture, DEVICE_A1, INSTITUTION_B, DEVICE_B1 } from '../../test/isolation-fixture';
import { INSTITUTION_A, TEACHER_A_ID } from '../../test/gateway-test-helpers';

/**
 * R0 — S10: control actions are audited (who, what, which device, from where).
 */
describe('R0 · S10 — Audit of control actions', () => {
  let db: DatabaseService;
  let fx: Awaited<ReturnType<typeof buildTwoTenantFixture>>;
  const settle = () => new Promise((r) => setTimeout(r, 50));

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    db = new DatabaseService();
    await db.onModuleInit();
    fx = await buildTwoTenantFixture(db);
  });

  afterEach(async () => {
    await db.onModuleDestroy();
  });

  const auditRows = async (action: string) =>
    (await db.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY timestamp ASC', [action])).rows;

  it('audits device lock and unlock with actor, institution, device and IP', async () => {
    await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });
    await fx.gateway.handleTeacherUnlockDevice(fx.teacherA as any, { deviceId: DEVICE_A1 });

    const [lock] = await auditRows('DEVICE_LOCK');
    const [unlock] = await auditRows('DEVICE_UNLOCK');
    for (const row of [lock, unlock]) {
      expect(row.institution_id).toBe(INSTITUTION_A);
      expect(row.actor_user_id).toBe(TEACHER_A_ID);
      expect(row.entity_id).toBe(DEVICE_A1);
      expect(row.ip_address).toBe('10.0.0.100');
    }
  });

  it('audits classroom lock/unlock with the list of affected devices', async () => {
    await fx.gateway.handleTeacherLockClassroom(fx.teacherA as any, {});
    await fx.gateway.handleTeacherUnlockClassroom(fx.teacherA as any, {});
    const [lock] = await auditRows('CLASSROOM_LOCK');
    expect(lock.details_json.count).toBe(2);
    expect(lock.details_json.deviceIds).not.toContain(DEVICE_B1);
    expect(await auditRows('CLASSROOM_UNLOCK')).toHaveLength(1);
  });

  it('audits file send (single and broadcast), file collect and process kill', async () => {
    await fx.gateway.handleTeacherSendFile(fx.teacherA as any, {
      deviceId: DEVICE_A1,
      fileName: 'guia.pdf',
      fileSizeBytes: 3,
      fileContentBase64: 'YWJj',
    });
    await fx.gateway.handleTeacherSendFile(fx.teacherA as any, {
      broadcastToAll: true,
      fileName: 'guia.pdf',
      fileSizeBytes: 3,
      fileContentBase64: 'YWJj',
    });
    await fx.gateway.handleTeacherCollectFile(fx.teacherA as any, { deviceId: DEVICE_A1, filePath: 'entrega.docx' });
    await fx.gateway.handleTeacherKillProcess(fx.teacherA as any, { deviceId: DEVICE_A1, pid: 4242, processName: 'juego' });

    const sends = await auditRows('FILE_SEND');
    expect(sends).toHaveLength(2);
    expect(sends.map((r: any) => r.details_json.fileName)).toEqual(['guia.pdf', 'guia.pdf']);
    const [collect] = await auditRows('FILE_COLLECT');
    expect(collect.details_json.filePath).toBe('entrega.docx');
    const [kill] = await auditRows('PROCESS_KILL');
    expect(kill.details_json.pid).toBe(4242);
  });

  it('audits remote control start once (not per input) and end with duration and input count', async () => {
    for (let i = 0; i < 5; i++) {
      await fx.gateway.handleTeacherRemoteInput(fx.teacherA as any, { deviceId: DEVICE_A1, type: 'mousemove', x: i, y: i });
    }
    await settle();
    expect(await auditRows('REMOTE_CONTROL_START')).toHaveLength(1);
    expect(await auditRows('REMOTE_CONTROL_END')).toHaveLength(0);

    // Idle timeout ends the session.
    for (const s of (fx.gateway as any).remoteControlSessions.values()) s.lastInputAt = Date.now() - 120_000;
    (fx.gateway as any).checkStaleConnections();
    await settle();

    const [end] = await auditRows('REMOTE_CONTROL_END');
    expect(end.entity_id).toBe(DEVICE_A1);
    expect(end.details_json.inputCount).toBe(5);
    expect(end.details_json.reason).toBe('Inactividad');
  });

  it('teacher disconnect ends and audits an open remote control session', async () => {
    await fx.gateway.handleTeacherRemoteInput(fx.teacherA as any, { deviceId: DEVICE_A1, type: 'click', x: 1, y: 1 });
    fx.gateway.handleDisconnect(fx.teacherA as any);
    await settle();
    const [end] = await auditRows('REMOTE_CONTROL_END');
    expect(end.details_json.reason).toBe('Docente desconectado');
  });

  it('rejected cross-tenant actions leave no audit rows in the foreign institution', async () => {
    await fx.gateway.handleTeacherLockDevice(fx.teacherA as any, { deviceId: DEVICE_B1 });
    const rows = (await db.query('SELECT * FROM audit_logs WHERE institution_id = $1', [INSTITUTION_B])).rows;
    expect(rows).toHaveLength(0);
  });
});
