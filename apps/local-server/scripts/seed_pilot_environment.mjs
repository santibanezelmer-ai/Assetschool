/**
 * ASSETSCHOOL — SEED DE CONFIGURACIÓN INSTITUCIONAL PARA PILOTO ESCOLAR (FASE J)
 * 
 * Configura con datos ficticios autorizados:
 * - Institución: Colegio Experimental Los Andes - Piloto
 * - Usuario Administrador TIC: admin.piloto@losandes.lan
 * - Docente: profesor.piloto@losandes.lan (Prof. Roberto Morales)
 * - Curso: 1ro Medio A (1MA-2026)
 * - Aula: Laboratorio TIC 1 (LAB-TIC-01)
 * - Estudiantes (x2): Lucas Silva (EST-001) y Martina Valdés (EST-002)
 * - Dispositivos enrolados (x2): MAC-ALFA-EST01 y MAC-BETA-EST02
 * - Asignación estudiante-dispositivo e historial auditable.
 */

import pg from 'pg';
import bcrypt from 'bcrypt';

export const PILOT_CONFIG = {
  institution: {
    id: 'e1111111-1111-1111-1111-111111111111',
    name: 'Colegio Experimental Los Andes - Piloto',
    code: 'PILOTO-LA',
    taxId: '76.543.210-K',
    address: 'Av. Las Araucarias 1234',
    region: 'Metropolitana',
    commune: 'Providencia',
    phone: '+56223456789',
    email: 'contacto@losandes.lan',
  },
  admin: {
    id: 'a1111111-1111-1111-1111-111111111111',
    username: 'admin.piloto',
    email: 'admin.piloto@losandes.lan',
    firstName: 'Admin',
    lastName: 'Piloto TIC',
    password: 'AssetSchoolPiloto2026!',
  },
  teacher: {
    id: 'a2222222-2222-2222-2222-222222222222',
    username: 'profesor.piloto',
    email: 'profesor.piloto@losandes.lan',
    firstName: 'Roberto',
    lastName: 'Morales',
    password: 'AssetSchoolDocente2026!',
  },
  course: {
    id: 'c0000001-1111-1111-1111-111111111111',
    name: '1ro Medio A',
    code: '1MA-2026',
    grade: '1ro Medio',
    section: 'A',
    academicYear: 2026,
  },
  classroom: {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'Laboratorio TIC 1',
    code: 'LAB-TIC-01',
    capacity: 25,
    subnetLan: '192.168.4.0/22',
    broadcastIp: '192.168.7.255',
    operationalStatus: 'ACTIVE',
  },
  devices: [
    {
      id: 'd1111111-aaaa-1111-aaaa-111111111111',
      deviceName: 'MAC-ALFA-EST01',
      hostname: 'mac-alfa-est01.lan',
      macAddress: '52:54:00:12:34:56',
      localIp: '192.168.4.101',
      osType: 'macos',
      osVersion: '15.6',
      architecture: 'x86_64',
    },
    {
      id: 'd2222222-bbbb-2222-bbbb-222222222222',
      deviceName: 'MAC-BETA-EST02',
      hostname: 'mac-beta-est02.lan',
      macAddress: '52:54:00:78:9A:BC',
      localIp: '192.168.4.102',
      osType: 'macos',
      osVersion: '15.6',
      architecture: 'x86_64',
    },
  ],
  students: [
    {
      id: 'f1111111-1111-1111-1111-111111111111',
      studentCode: 'EST-001',
      firstName: 'Lucas',
      lastName: 'Silva',
      email: 'estudiante01.piloto@losandes.lan',
      deviceId: 'd1111111-aaaa-1111-aaaa-111111111111',
    },
    {
      id: 'f2222222-2222-2222-2222-222222222222',
      studentCode: 'EST-002',
      firstName: 'Martina',
      lastName: 'Valdés',
      email: 'estudiante02.piloto@losandes.lan',
      deviceId: 'd2222222-bbbb-2222-bbbb-222222222222',
    },
  ],
};

export async function seedPilotDatabase() {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await client.connect();

  try {
    const { institution, admin, teacher, course, classroom, devices, students } = PILOT_CONFIG;

    // 1. Institución
    await client.query(`
      INSERT INTO institutions (id, name, code, rut, address, region, comuna, contact_phone, contact_email, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        code = EXCLUDED.code, 
        rut = EXCLUDED.rut,
        address = EXCLUDED.address,
        is_active = true;
    `, [
      institution.id, institution.name, institution.code, institution.taxId,
      institution.address, institution.region, institution.commune, institution.phone, institution.email,
    ]);

    // Roles
    const adminRoleRes = await client.query("SELECT id FROM roles WHERE name = 'INSTITUTION_ADMIN'");
    const adminRoleId = adminRoleRes.rows[0].id;
    const teacherRoleRes = await client.query("SELECT id FROM roles WHERE name = 'TEACHER'");
    const teacherRoleId = teacherRoleRes.rows[0].id;

    // 2. Administrador
    const adminPassHash = await bcrypt.hash(admin.password, 10);
    await client.query(`
      INSERT INTO users (id, institution_id, role_id, username, email, password_hash, first_name, last_name, is_active, must_change_password)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false)
      ON CONFLICT (id) DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        is_active = true,
        must_change_password = false;
    `, [admin.id, institution.id, adminRoleId, admin.username, admin.email, adminPassHash, admin.firstName, admin.lastName]);

    // 3. Docente
    const teacherPassHash = await bcrypt.hash(teacher.password, 10);
    await client.query(`
      INSERT INTO users (id, institution_id, role_id, username, email, password_hash, first_name, last_name, is_active, must_change_password)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false)
      ON CONFLICT (id) DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        is_active = true,
        must_change_password = false;
    `, [teacher.id, institution.id, teacherRoleId, teacher.username, teacher.email, teacherPassHash, teacher.firstName, teacher.lastName]);

    // 4. Curso
    await client.query(`
      INSERT INTO courses (id, institution_id, name, code, grade, section, academic_year, lead_teacher_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        lead_teacher_id = EXCLUDED.lead_teacher_id,
        is_active = true;
    `, [course.id, institution.id, course.name, course.code, course.grade, course.section, course.academicYear, teacher.id]);

    // 5. Aula
    await client.query(`
      INSERT INTO classrooms (id, institution_id, name, code, capacity, subnet_lan, broadcast_ip, operational_status, is_online)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        capacity = EXCLUDED.capacity,
        operational_status = EXCLUDED.operational_status,
        is_online = true;
    `, [classroom.id, institution.id, classroom.name, classroom.code, classroom.capacity, classroom.subnetLan, classroom.broadcastIp, classroom.operationalStatus]);

    // 6. Dispositivos
    for (const dev of devices) {
      await client.query(`
        INSERT INTO devices (id, institution_id, device_name, hostname, mac_address, local_ip, os_type, os_version, architecture, status, current_classroom_id, is_revoked, enrolled_at, last_heartbeat_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ONLINE', $10, false, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET 
          device_name = EXCLUDED.device_name,
          hostname = EXCLUDED.hostname,
          mac_address = EXCLUDED.mac_address,
          local_ip = EXCLUDED.local_ip,
          current_classroom_id = EXCLUDED.current_classroom_id, 
          is_revoked = false,
          status = 'ONLINE',
          last_heartbeat_at = NOW();
      `, [dev.id, institution.id, dev.deviceName, dev.hostname, dev.macAddress, dev.localIp, dev.osType, dev.osVersion, dev.architecture, classroom.id]);
    }

    // 7. Estudiantes
    for (const st of students) {
      await client.query(`
        INSERT INTO students (id, institution_id, student_code, first_name, last_name, email, assigned_course_id, assigned_device_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET 
          institution_id = EXCLUDED.institution_id,
          student_code = EXCLUDED.student_code,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          assigned_course_id = EXCLUDED.assigned_course_id, 
          assigned_device_id = EXCLUDED.assigned_device_id,
          status = 'ACTIVE';
      `, [st.id, institution.id, st.studentCode, st.firstName, st.lastName, st.email, course.id, st.deviceId]);

      await client.query(`
        UPDATE devices SET current_student_id = $1 WHERE id = $2;
      `, [st.id, st.deviceId]);

      // Historial
      await client.query(`
        INSERT INTO student_device_history (id, institution_id, student_id, device_id, assigned_at, assigned_by, notes)
        VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5);
      `, [institution.id, st.id, st.deviceId, admin.id, `Asignación para Piloto Escolar aula ${classroom.name}`]);
    }

    // 8. Vincular docente al aula en user_classrooms
    await client.query(`
      INSERT INTO user_classrooms (id, institution_id, user_id, classroom_id)
      VALUES (gen_random_uuid(), $1, $2, $3)
      ON CONFLICT DO NOTHING;
    `, [institution.id, teacher.id, classroom.id]);

    // Vincular docente al curso en user_courses
    await client.query(`
      INSERT INTO user_courses (id, institution_id, user_id, course_id, is_lead_teacher)
      VALUES (gen_random_uuid(), $1, $2, $3, true)
      ON CONFLICT DO NOTHING;
    `, [institution.id, teacher.id, course.id]);

    console.log('✅ Base de datos inicializada exitosamente para el Piloto Escolar.');
    return true;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed_pilot_environment.mjs')) {
  seedPilotDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error al inicializar piloto:', err);
      process.exit(1);
    });
}
