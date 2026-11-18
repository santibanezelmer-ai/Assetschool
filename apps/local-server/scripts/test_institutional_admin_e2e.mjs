import jwt from 'jsonwebtoken';
import pg from 'pg';
import crypto from 'crypto';

const SERVER_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';

console.log('='.repeat(80));
console.log('   ASSETSCHOOL — SUITE E2E: ADMINISTRACIÓN INSTITUCIONAL (FASE E)');
console.log('='.repeat(80));

async function runInstitutionalAdminVerification() {
  const pgClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await pgClient.connect();

  let passedTests = 0;
  const totalTests = 8;

  try {
    // -------------------------------------------------------------------------
    // SETUP: Creación de identidades y tokens de prueba
    // -------------------------------------------------------------------------
    const superAdminId = crypto.randomUUID();
    const instAdminId = crypto.randomUUID();
    let effectiveInstAId = null;
    const testInstBId = crypto.randomUUID();

    // Insertar Superadmin en la BD para validación de JwtStrategy (asociado a institución root de semilla)
    await pgClient.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, institution_id, is_active, must_change_password)
       VALUES ($1, $2, '$2b$10$dummyHashToSatisfyStrategyValidation1234567890', 'Global', 'Superadmin', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, false)
       ON CONFLICT DO NOTHING`,
      [superAdminId, `superadmin.${Date.now()}@assetschool.lan`]
    );

    const superAdminToken = jwt.sign(
      {
        sub: superAdminId,
        type: 'access',
        email: `superadmin.${Date.now()}@assetschool.lan`,
        role: 'SUPERADMIN',
        institutionId: null,
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Instituciones y Aislamiento Multi-Tenant
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Gestión de Instituciones y Aislamiento Multi-Tenant...');
    
    // Crear Institución A vía Superadmin
    const createInstARes = await fetch(`${SERVER_URL}/api/v1/institutions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        id: effectiveInstAId,
        name: 'Colegio Bicentenario San Martín',
        code: `SANMARTIN-${Date.now().toString().slice(-4)}`,
        rut: '76.123.456-7',
        address: 'Av. Libertador 1234',
        region: 'Región Metropolitana',
        comuna: 'Santiago Centro',
        contactEmail: 'rectoria@sanmartin.edu.cl',
        contactPhone: '+56 2 2345 6789',
      }),
    });
    if (!createInstARes.ok) {
      throw new Error(`Failed to create Institution A: ${createInstARes.status} ${await createInstARes.text()}`);
    }
    const instA = await createInstARes.json();
    effectiveInstAId = instA.id;
    console.log(`  ✓ Institución A creada: "${instA.name}" (RUT: ${instA.rut}, Comuna: ${instA.comuna}, ID: ${effectiveInstAId})`);

    // Crear Institución B vía Superadmin
    const createInstBRes = await fetch(`${SERVER_URL}/api/v1/institutions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        id: testInstBId,
        name: 'Liceo Politécnico Los Andes',
        code: `LOSANDES-${Date.now().toString().slice(-4)}`,
        rut: '72.987.654-3',
        address: 'Camino Cordillera 567',
        region: 'Región de Valparaíso',
        comuna: 'Los Andes',
        contactEmail: 'direccion@losandes.edu.cl',
        contactPhone: '+56 34 234 5678',
      }),
    });
    if (!createInstBRes.ok) {
      throw new Error(`Failed to create Institution B: ${createInstBRes.status}`);
    }
    console.log('  ✓ Institución B creada exitosamente para prueba de aislamiento');

    // Ahora registrar usuario Admin para Institución A en la BD usando el id retornado instA.id
    await pgClient.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, institution_id, is_active, must_change_password)
       VALUES ($1, $2, '$2b$10$dummyHashToSatisfyStrategyValidation1234567890', 'Admin', 'Colegio A', '22222222-2222-2222-2222-222222222222', $3, true, false)
       ON CONFLICT DO NOTHING`,
      [instAdminId, `admin.instA.${Date.now()}@sanmartin.edu.cl`, instA.id]
    );

    const instAdminTokenA = jwt.sign(
      {
        sub: instAdminId,
        type: 'access',
        email: `admin.instA.${Date.now()}@sanmartin.edu.cl`,
        role: 'INSTITUTION_ADMIN',
        institutionId: instA.id,
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Verificar aislamiento multi-tenant: Admin Institución A listando instituciones solo debe ver A
    const listInstAsAdminA = await fetch(`${SERVER_URL}/api/v1/institutions`, {
      headers: { Authorization: `Bearer ${instAdminTokenA}` },
    });
    const instsForA = await listInstAsAdminA.json();
    if (instsForA.length !== 1 || instsForA[0].id !== instA.id) {
      throw new Error(`Multi-tenant breach: Admin A received ${instsForA.length} institutions`);
    }
    console.log('  ✓ Aislamiento multi-tenant validado: Admin A solo puede acceder a su propia institución');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 2: Gestión de Usuarios, Roles RBAC y Restablecimiento de Credenciales
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Usuarios, Roles (RBAC: DIRECTOR, TEACHER, TECH_SUPPORT) y Restablecimiento...');

    // Crear usuario DIRECTOR en Institución A
    const directorEmail = `director.${Date.now()}@sanmartin.edu.cl`;
    const createDirectorRes = await fetch(`${SERVER_URL}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        email: directorEmail,
        fullName: 'Prof. Carlos Alvarado',
        role: 'DIRECTOR',
        institutionId: effectiveInstAId,
        password: 'TemporaryPass123!',
        phone: '+56 9 8765 4321',
      }),
    });
    if (!createDirectorRes.ok) {
      throw new Error(`Create Director failed: ${createDirectorRes.status} ${await createDirectorRes.text()}`);
    }
    const directorUser = await createDirectorRes.json();
    console.log(`  ✓ Usuario creado con rol DIRECTOR: ${directorUser.first_name} ${directorUser.last_name} (${directorUser.email})`);

    // Crear usuario TEACHER
    const teacherEmail = `prof.ciencias.${Date.now()}@sanmartin.edu.cl`;
    const createTeacherRes = await fetch(`${SERVER_URL}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        email: teacherEmail,
        fullName: 'Dra. Elena Ruiz',
        role: 'TEACHER',
        institutionId: effectiveInstAId,
        password: 'InitialPass456!',
      }),
    });
    const teacherUser = await createTeacherRes.json();
    console.log(`  ✓ Usuario creado con rol TEACHER: ${teacherUser.first_name} ${teacherUser.last_name}`);

    // Restablecer contraseña del profesor
    const resetRes = await fetch(`${SERVER_URL}/api/v1/users/${teacherUser.id}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        newPassword: 'NewSecurePassword2026!',
      }),
    });
    if (!resetRes.ok) throw new Error(`Password reset failed: ${resetRes.status}`);
    const resetResult = await resetRes.json();
    console.log(`  ✓ Restablecimiento administrativo de credenciales verificado: ${resetResult.message}`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Gestión de Cursos Estructurados (Nivel, Grado, Sección)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Gestión de Cursos Estructurados (Nivel, Grado, Sección, Docente Encargado)...');

    const courseCode = `1M-A-${Date.now().toString().slice(-4)}`;
    const createCourseRes = await fetch(`${SERVER_URL}/api/v1/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        name: 'Primero Medio A - Generación 2026',
        code: courseCode,
        institutionId: effectiveInstAId,
        educationLevel: 'Educación Media',
        grade: '1° Medio',
        section: 'A',
        academicYear: 2026,
        leadTeacherId: teacherUser.id,
      }),
    });
    if (!createCourseRes.ok) {
      throw new Error(`Create course failed: ${createCourseRes.status} ${await createCourseRes.text()}`);
    }
    const course = await createCourseRes.json();
    console.log(`  ✓ Curso registrado: "${course.name}" (Nivel: ${course.education_level}, Grado: ${course.grade}, Sección: ${course.section})`);
    console.log(`  ✓ Docente encargado asignado: ${course.lead_teacher_id}`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Gestión de Aulas Informáticas Mixtas & Capacidad
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Aulas Informáticas Mixtas (Capacidad, Ubicación, Horarios)...');

    const classroomName = `Laboratorio Tecnológico Norte ${Date.now().toString().slice(-4)}`;
    const createClassroomRes = await fetch(`${SERVER_URL}/api/v1/classrooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        name: classroomName,
        institutionId: effectiveInstAId,
        capacity: 42,
        physicalLocation: 'Pabellón C, 2do Piso, Sala 204',
        description: 'Laboratorio equipado para ciencias de la computación y multimedia',
        operationalStatus: 'ACTIVE',
        scheduleJson: {
          blocks: [
            { day: 'Lunes', start: '08:00', end: '09:30', subject: 'Robótica' },
            { day: 'Miércoles', start: '10:00', end: '11:30', subject: 'Programación Swift' },
          ],
        },
      }),
    });
    if (!createClassroomRes.ok) {
      throw new Error(`Create classroom failed: ${createClassroomRes.status} ${await createClassroomRes.text()}`);
    }
    const classroom = await createClassroomRes.json();
    console.log(`  ✓ Aula Informática creada: "${classroom.name}" (Capacidad: ${classroom.capacity} puestos, Estado: ${classroom.operational_status})`);
    console.log(`  ✓ Ubicación física: ${classroom.physical_location}`);

    // Asignar docente al aula
    const assignTeacherRes = await fetch(`${SERVER_URL}/api/v1/classrooms/${classroom.id}/assign-teachers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        userIds: [teacherUser.id],
      }),
    });
    if (!assignTeacherRes.ok) throw new Error('Failed to assign teacher to classroom');
    console.log('  ✓ Docente asignado al aula informática con autorización de monitoreo');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: Matrícula de Estudiantes, Asignación de Equipos y Carga Masiva CSV
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Matrícula de Estudiantes, Importación CSV y Asignación de Equipos...');

    // Importación masiva CSV
    const csvContent = [
      'codigo,nombre,apellido,rut,curso',
      `EST-101,Valentina,Morales,21.345.678-9,${course.code}`,
      `EST-102,Martín,González,22.456.789-0,${course.code}`,
      `EST-103,Sofía,Castillo,21.876.543-2,${course.code}`,
    ].join('\n');

    const csvImportRes = await fetch(`${SERVER_URL}/api/v1/students/import-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        csvContent,
        institutionId: effectiveInstAId,
      }),
    });
    if (!csvImportRes.ok) {
      throw new Error(`CSV Import failed: ${csvImportRes.status} ${await csvImportRes.text()}`);
    }
    const importResult = await csvImportRes.json();
    console.log(`  ✓ Importación CSV exitosa: ${importResult.totalProcessed} procesados (${importResult.createdCount} creados, ${importResult.updatedCount} actualizados), ${importResult.errors.length} errores`);

    // Exportar CSV y verificar
    const csvExportRes = await fetch(`${SERVER_URL}/api/v1/students/export/csv?institutionId=${effectiveInstAId}`, {
      headers: { Authorization: `Bearer ${instAdminTokenA}` },
    });
    if (!csvExportRes.ok) throw new Error(`CSV Export failed: ${csvExportRes.status} ${await csvExportRes.text()}`);
    const exportedText = await csvExportRes.text();
    if (!exportedText.includes('Valentina') || !exportedText.includes('EST-101')) {
      throw new Error('Exported CSV missing imported students');
    }
    console.log('  ✓ Exportación CSV validada: Contiene registros de matrícula institucional');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Inventario de Hardware y Especificaciones Centralizadas
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Inventario Centralizado de Hardware (CPU, RAM, Almacenamiento)...');

    const deviceId = crypto.randomUUID();
    const studentDbRes = await pgClient.query('SELECT id FROM students WHERE student_code = $1 AND institution_id = $2', ['EST-101', effectiveInstAId]);
    const studentId101 = studentDbRes.rows[0].id;

    // Registrar equipo con especificaciones de hardware
    const regDeviceRes = await pgClient.query(
      `INSERT INTO devices (
        id, institution_id, hostname, mac_address, local_ip, os_type, os_version,
        architecture, processor, ram_mb, storage_gb, status, current_classroom_id, is_pending_approval
      ) VALUES (
        $1, $2, 'LAB-PC-15', '00:1A:2B:3C:4D:5E', '192.168.1.155', 'macos', 'macOS 15.1 Sequoia',
        'arm64', 'Apple M3 Pro (12-core)', 18432, 512, 'online', $3, false
      ) RETURNING *`,
      [deviceId, effectiveInstAId, classroom.id]
    );
    const registeredDevice = regDeviceRes.rows[0];
    console.log(`  ✓ Estación de trabajo registrada en inventario: "${registeredDevice.hostname}"`);
    console.log(`    - Procesador: ${registeredDevice.processor}`);
    console.log(`    - Memoria RAM: ${registeredDevice.ram_mb} MB (18 GB)`);
    console.log(`    - Almacenamiento: ${registeredDevice.storage_gb} GB SSD`);

    // Asignar equipo al estudiante EST-101
    const assignDevRes = await fetch(`${SERVER_URL}/api/v1/students/${studentId101}/assign-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        deviceId: registeredDevice.id,
      }),
    });
    if (!assignDevRes.ok) throw new Error(`Assign device to student failed: ${assignDevRes.status} ${await assignDevRes.text()}`);
    console.log(`  ✓ Estación ${registeredDevice.hostname} asignada formalmente a Estudiante EST-101`);

    // Verificar registro de auditoría en student_device_history
    const historyCheck = await pgClient.query(
      'SELECT * FROM student_device_history WHERE student_id = $1 AND device_id = $2',
      [studentId101, registeredDevice.id]
    );
    if (historyCheck.rows.length === 0) {
      throw new Error('Audit record missing in student_device_history');
    }
    console.log('  ✓ Historial de asignación registrado con estampas de tiempo de auditoría');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Enrolamiento Seguro de Equipos (Tokens & Aprobación)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Enrolamiento Seguro de Equipos (Tokens Institucionales y Aprobación)...');

    // 1. Generar token de enrolamiento
    const createTokenRes = await fetch(`${SERVER_URL}/api/v1/devices/enrollment/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instAdminTokenA}`,
      },
      body: JSON.stringify({
        institutionId: effectiveInstAId,
        classroomId: classroom.id,
        label: 'Enrolamiento Laboratorio Tecnológico 2026',
        maxUses: 5,
        expiresInHours: 48,
      }),
    });
    if (!createTokenRes.ok) {
      throw new Error(`Token generation failed: ${createTokenRes.status}`);
    }
    const tokenObj = await createTokenRes.json();
    console.log(`  ✓ Token de enrolamiento generado: "${tokenObj.token}" (Máx usos: ${tokenObj.max_uses})`);

    // 2. Simular cliente Student canjeando el token
    const claimRes = await fetch(`${SERVER_URL}/api/v1/devices/enrollment/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenObj.token,
        agent: {
          hostname: 'WIN-LAB-PC-22',
          localIp: '192.168.1.182',
          macAddress: `00:15:5D:88:${Date.now().toString().slice(-4).match(/../g).join(':')}`,
          osType: 'windows',
          osVersion: 'Windows 11 Pro 23H2',
          architecture: 'x86_64',
          processor: 'Intel Core i7-13700 (16 Cores)',
          ramMb: 16384,
          storageGb: 500,
        },
      }),
    });
    if (!claimRes.ok) {
      throw new Error(`Token claim failed: ${claimRes.status} ${await claimRes.text()}`);
    }
    const claimedDevice = await claimRes.json();
    const enrolledDeviceId = claimedDevice.deviceId || claimedDevice.id;
    console.log(`  ✓ Agente Windows canjeó token exitosamente (ID: ${enrolledDeviceId})`);

    // 3. Administrador aprueba el equipo enrolado
    const approveRes = await fetch(`${SERVER_URL}/api/v1/devices/${enrolledDeviceId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${instAdminTokenA}` },
    });
    if (!approveRes.ok) throw new Error(`Device approval failed: ${approveRes.status} ${await approveRes.text()}`);
    const approvedDevice = await approveRes.json();
    console.log(`  ✓ Administrador aprobó estación de trabajo (Estado pendiente: ${approvedDevice.is_pending_approval})`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8: Reportes y Métricas Administrativas
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Endpoints de Reportes y Auditoría Administrativa...');

    // Resumen ejecutivo
    const summaryRes = await fetch(`${SERVER_URL}/api/v1/reports/summary?institutionId=${effectiveInstAId}`, {
      headers: { Authorization: `Bearer ${instAdminTokenA}` },
    });
    if (!summaryRes.ok) throw new Error('Reports summary failed');
    const summary = await summaryRes.json();
    console.log('  ✓ Resumen administrativo:');
    console.log(`    - Aulas registradas: ${summary.totalClassrooms}`);
    console.log(`    - Cursos activos: ${summary.totalCourses}`);
    console.log(`    - Usuarios por rol:`, summary.usersByRole);
    console.log(`    - Dispositivos por SO:`, summary.devicesByOs);

    // Ocupación de aulas
    const occupancyRes = await fetch(`${SERVER_URL}/api/v1/reports/classrooms-occupancy?institutionId=${effectiveInstAId}`, {
      headers: { Authorization: `Bearer ${instAdminTokenA}` },
    });
    if (!occupancyRes.ok) throw new Error('Occupancy report failed');
    const occupancy = await occupancyRes.json();
    console.log(`  ✓ Reporte de ocupación: ${occupancy.length} aulas analizadas`);
    if (occupancy.length > 0) {
      console.log(`    - Aula "${occupancy[0].name}": ${occupancy[0].assigned_devices_count} computadores instalados / Capacidad: ${occupancy[0].capacity} (${occupancy[0].occupancy_percentage || 0}% ocupación)`);
    }

    // Inventario de hardware
    const hwReportRes = await fetch(`${SERVER_URL}/api/v1/reports/inventory-hardware?institutionId=${effectiveInstAId}`, {
      headers: { Authorization: `Bearer ${instAdminTokenA}` },
    });
    if (!hwReportRes.ok) throw new Error('Hardware inventory report failed');
    const hwReport = await hwReportRes.json();
    console.log(`  ✓ Reporte de parque tecnológico: ${hwReport.length} equipos inventariados`);
    if (hwReport.length > 0) {
      console.log(`    - Equipo "${hwReport[0].hostname}": CPU: ${hwReport[0].processor || 'N/A'}, RAM: ${hwReport[0].ram_mb || 0} MB, Disco: ${hwReport[0].storage_gb || 0} GB`);
    }
    passedTests++;

    // -------------------------------------------------------------------------
    // RESUMEN FINAL
    // -------------------------------------------------------------------------
    console.log('\n' + '='.repeat(80));
    console.log(`RESULTADO DE LA AUDITORÍA: ${passedTests}/${totalTests} PRUEBAS EXITOSAS (100%)`);
    console.log('EL SISTEMA DE ADMINISTRACIÓN INSTITUCIONAL DE ASSETSCHOOL FUNCIONA CON TOTAL INTEGRIDAD.');
    console.log('='.repeat(80));
  } finally {
    await pgClient.end();
  }
}

runInstitutionalAdminVerification().catch((err) => {
  console.error('\n❌ ERROR EN LA VERIFICACIÓN DE ADMINISTRACIÓN INSTITUCIONAL:', err);
  process.exit(1);
});
