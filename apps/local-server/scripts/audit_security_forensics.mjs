import jwt from 'jsonwebtoken';
import pg from 'pg';
import crypto from 'crypto';

const SERVER_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';

console.log('='.repeat(80));
console.log('   ASSETSCHOOL — AUDITORÍA FORENSE DE SEGURIDAD Y PRUEBAS NEGATIVAS');
console.log('='.repeat(80));

async function runSecurityForensics() {
  const pgClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await pgClient.connect();

  const findings = [];

  try {
    const instAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // Default seed inst
    const instBId = crypto.randomUUID();

    // Crear institución B para pruebas de aislamiento
    await pgClient.query(
      `INSERT INTO institutions (id, code, name, rut, address, region, comuna, contact_email)
       VALUES ($1, $2, 'Colegio de Prueba Aislamiento', '70.111.222-3', 'Calle Falsa 123', 'Metropolitana', 'Providencia', 'tic@colegiob.edu')
       ON CONFLICT (id) DO NOTHING;`,
      [instBId, `INST-SEC-${Date.now().toString().slice(-4)}`]
    );

    // Identidades
    const teacherAId = crypto.randomUUID();
    const teacherEmailA = `teacher.secA.${Date.now()}@assetschool.lan`;
    await pgClient.query(
      `INSERT INTO users (id, institution_id, role_id, email, password_hash, first_name, last_name, is_active, must_change_password)
       VALUES ($1, $2, '33333333-3333-3333-3333-333333333333', $3, '$2b$10$dummyHashToSatisfyStrategyValidation1234567890', 'Profesor', 'A', true, false)
       ON CONFLICT DO NOTHING;`,
      [teacherAId, instAId, teacherEmailA]
    );

    const teacherTokenA = jwt.sign(
      { sub: teacherAId, type: 'access', email: teacherEmailA, role: 'TEACHER', institutionId: instAId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const studentId = '55555555-5555-5555-5555-555555555555';
    const studentToken = jwt.sign(
      { sub: studentId, type: 'access', email: 'alumno_test@assetschool.lan', role: 'STUDENT', institutionId: instAId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST SEC-1: Multi-Tenant Data Isolation (Cross-Tenant Access)
    // -------------------------------------------------------------------------
    console.log('\n[SEC-1] Prueba Negativa: Intento de acceso cruzado entre instituciones...');
    // Teacher de Institución A intenta listar cursos pasando institutionId de Institución B
    const crossTenantCoursesRes = await fetch(`${SERVER_URL}/api/v1/courses?institutionId=${instBId}`, {
      headers: { Authorization: `Bearer ${teacherTokenA}` },
    });
    const coursesData = await crossTenantCoursesRes.json();
    // CoursesService restringe targetInstId a userInstitutionId si no es SUPERADMIN
    const leakDetected = coursesData.some((c) => c.institution_id === instBId);
    if (leakDetected) {
      findings.push({ severity: 'CRÍTICO', title: 'Fuga de datos multi-tenant en /api/v1/courses' });
      console.log('  ❌ CRÍTICO: Fuga de datos detectada entre instituciones');
    } else {
      console.log('  ✓ Aislamiento multi-tenant efectivo: Servidor filtró datos y evitó fuga.');
    }

    // -------------------------------------------------------------------------
    // TEST SEC-2: RBAC Privilege Escalation
    // -------------------------------------------------------------------------
    console.log('\n[SEC-2] Prueba Negativa: Intento de escalamiento de privilegios RBAC...');
    // Profesor intentando crear institución (Solo SUPERADMIN)
    const escInstRes = await fetch(`${SERVER_URL}/api/v1/institutions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherTokenA}` },
      body: JSON.stringify({ name: 'Hacked Inst', code: 'HACK01' }),
    });
    if (escInstRes.status === 403) {
      console.log('  ✓ Bloqueo RBAC efectivo: Endpoint /api/v1/institutions rechazó al rol TEACHER (403)');
    } else {
      findings.push({ severity: 'ALTO', title: `Bypass RBAC en instituciones (HTTP ${escInstRes.status})` });
      console.log(`  ❌ ALTO: Fallo en control RBAC. Status: ${escInstRes.status}`);
    }

    // Alumno intentando invocar comandos o crear usuarios
    const escUserRes = await fetch(`${SERVER_URL}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ email: 'fake@hacker.lan', roleName: 'SUPERADMIN' }),
    });
    if (escUserRes.status === 403) {
      console.log('  ✓ Bloqueo RBAC efectivo: Endpoint /api/v1/users rechazó al rol STUDENT (403)');
    } else {
      findings.push({ severity: 'ALTO', title: `Bypass RBAC en users por STUDENT (HTTP ${escUserRes.status})` });
    }

    // -------------------------------------------------------------------------
    // TEST SEC-3: Forged / Expired JWT Tokens
    // -------------------------------------------------------------------------
    console.log('\n[SEC-3] Prueba Negativa: Tokens JWT adulterados o expirados...');
    const fakeSecretToken = jwt.sign(
      { sub: teacherAId, type: 'access', email: teacherEmailA, role: 'SUPERADMIN' },
      'totally_wrong_secret_1234567890',
      { expiresIn: '1h' }
    );
    const forgedRes = await fetch(`${SERVER_URL}/api/v1/institutions`, {
      headers: { Authorization: `Bearer ${fakeSecretToken}` },
    });
    if (forgedRes.status === 401) {
      console.log('  ✓ Rechazo criptográfico de JWT con clave secreta forjada (401)');
    } else {
      findings.push({ severity: 'CRÍTICO', title: 'Aceptación de JWT con clave secreta falsa' });
    }

    const expiredToken = jwt.sign(
      { sub: teacherAId, type: 'access', email: teacherEmailA, role: 'TEACHER', institutionId: instAId },
      JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const expiredRes = await fetch(`${SERVER_URL}/api/v1/classrooms`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    if (expiredRes.status === 401) {
      console.log('  ✓ Rechazo de JWT expirado (401)');
    } else {
      findings.push({ severity: 'ALTO', title: 'Aceptación de JWT expirado' });
    }

    // -------------------------------------------------------------------------
    // TEST SEC-4: Device Enrollment Token Reuse & Revocation
    // -------------------------------------------------------------------------
    console.log('\n[SEC-4] Prueba Negativa: Reutilización de token agotado y revocado...');
    // Generar token con max_uses = 1 vía base de datos
    const singleToken = `SEC-TOKEN-${Date.now()}`;
    await pgClient.query(
      `INSERT INTO enrollment_tokens (token, institution_id, label, max_uses, uses_count, is_revoked, expires_at)
       VALUES ($1, $2, 'Single Use Token', 1, 0, false, NOW() + INTERVAL '1 hour');`,
      [singleToken, instAId]
    );

    // Primer canje
    const claim1 = await fetch(`${SERVER_URL}/api/v1/devices/enrollment/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: singleToken,
        agent: {
          hostname: 'PC-SEC-01',
          macAddress: `00:SEC:01:${Date.now().toString().slice(-4).match(/../g).join(':')}`,
          localIp: '192.168.1.201',
          osType: 'windows',
          osVersion: 'Win11',
          architecture: 'x64',
        },
      }),
    });
    if (!claim1.ok) throw new Error(`Primer claim falló inesperadamente: ${claim1.status}`);

    // Segundo canje (debe fallar porque max_uses = 1)
    const claim2 = await fetch(`${SERVER_URL}/api/v1/devices/enrollment/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: singleToken,
        agent: {
          hostname: 'PC-SEC-02',
          macAddress: `00:SEC:02:${Date.now().toString().slice(-4).match(/../g).join(':')}`,
          localIp: '192.168.1.202',
          osType: 'windows',
          osVersion: 'Win11',
          architecture: 'x64',
        },
      }),
    });
    if (claim2.status === 400) {
      console.log('  ✓ Control de cupo de tokens efectivo: Segundo uso rechazado (400 - Cupo máximo alcanzado)');
    } else {
      findings.push({ severity: 'ALTO', title: 'Reutilización indebida de token de enrolamiento agotado' });
    }

    // -------------------------------------------------------------------------
    // TEST SEC-5: Tampered License Activation
    // -------------------------------------------------------------------------
    console.log('\n[SEC-5] Prueba Negativa: Inyección de licencia comercial adulterada...');
    // Crear token de admin
    const instAdminToken = jwt.sign(
      { sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', type: 'access', email: 'admin@assetschool.lan', role: 'INSTITUTION_ADMIN', institutionId: instAId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const tamperedLicenseRes = await fetch(`${SERVER_URL}/api/v1/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${instAdminToken}` },
      body: JSON.stringify({
        license: {
          institutionId: instAId,
          institutionName: 'Hacked License',
          maxDevices: 99999,
          validUntil: '2099-01-01T00:00:00Z',
          signature: 'DEADBEEF1234567890INVALID',
        },
      }),
    });
    if (tamperedLicenseRes.status === 400) {
      console.log('  ✓ Validación criptográfica de licencia efectiva: Licencia con firma falsa rechazada (400)');
    } else {
      findings.push({ severity: 'CRÍTICO', title: 'Aceptación de licencia comercial con firma adulterada' });
    }

    // -------------------------------------------------------------------------
    // TEST SEC-6: Inmutabilidad de la Tabla audit_logs
    // -------------------------------------------------------------------------
    console.log('\n[SEC-6] Auditoría Forense: Integridad e inmutabilidad de la tabla audit_logs...');
    // Verificar si audit_logs tiene triggers de inmutabilidad
    const triggersRes = await pgClient.query(
      `SELECT trigger_name, event_manipulation, action_statement
       FROM information_schema.triggers
       WHERE event_object_table = 'audit_logs';`
    );
    console.log(`  ℹ Triggers activos en audit_logs: ${triggersRes.rows.length}`);
    if (triggersRes.rows.length === 0) {
      findings.push({
        severity: 'MEDIO',
        title: 'Tabla audit_logs no cuenta con trigger que impida DELETE/UPDATE a nivel de motor',
        description: 'La inmutabilidad se confía a nivel de aplicación pero no está reforzada por un trigger BEFORE DELETE en PostgreSQL.',
      });
      console.log('  ⚠️ MEDIO: Falta trigger BEFORE DELETE / BEFORE UPDATE en audit_logs para inmutabilidad forzada por motor.');
    } else {
      console.log('  ✓ Inmutabilidad de audit_logs respaldada por triggers en PostgreSQL.');
    }

    // -------------------------------------------------------------------------
    // TEST SEC-7: Escaneo de Endpoints Públicos no Autenticados
    // -------------------------------------------------------------------------
    console.log('\n[SEC-7] Auditoría de Superficie de Ataque: Escaneo de endpoints sin cabecera Authorization...');
    const endpointsToProbe = [
      { path: '/api/v1/institutions', method: 'GET', expected: 401 },
      { path: '/api/v1/users', method: 'GET', expected: 401 },
      { path: '/api/v1/courses', method: 'GET', expected: 401 },
      { path: '/api/v1/students', method: 'GET', expected: 401 },
      { path: '/api/v1/classrooms', method: 'GET', expected: 401 },
      { path: '/api/v1/devices', method: 'GET', expected: 401 },
      { path: '/api/v1/commands', method: 'GET', expected: 401 },
      { path: '/api/v1/admin/backups', method: 'GET', expected: 401 },
      { path: '/api/v1/reports/summary', method: 'GET', expected: 401 },
      { path: '/api/v1/audit/logs', method: 'GET', expected: 401 },
      { path: '/api/v1/dashboard/metrics', method: 'GET', expected: 401 },
    ];

    let exposedCount = 0;
    for (const ep of endpointsToProbe) {
      const res = await fetch(`${SERVER_URL}${ep.path}`, { method: ep.method });
      if (res.status !== ep.expected) {
        findings.push({ severity: 'CRÍTICO', title: `Endpoint sensible expuesto sin autenticación: ${ep.path} (HTTP ${res.status})` });
        exposedCount++;
        console.log(`  ❌ CRÍTICO: ${ep.path} respondió HTTP ${res.status} sin token.`);
      }
    }
    if (exposedCount === 0) {
      console.log('  ✓ 11/11 endpoints auditados exigen obligatoriamente JWT válido (HTTP 401).');
    }

    console.log('\n' + '='.repeat(80));
    console.log(`RESUMEN DE AUDITORÍA FORENSE DE SEGURIDAD: ${findings.length} HALLAZGOS REGISTRADOS`);
    console.log('='.repeat(80));
    return findings;
  } finally {
    await pgClient.end();
  }
}

runSecurityForensics().catch((err) => {
  console.error('Error durante auditoría de seguridad:', err);
  process.exit(1);
});
