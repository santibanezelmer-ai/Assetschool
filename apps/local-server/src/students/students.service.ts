import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'crypto';

export interface CreateStudentDto {
  institutionId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  nationalId?: string;
  assignedCourseId?: string;
  assignedDeviceId?: string;
  status?: string;
}

export interface UpdateStudentDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  nationalId?: string;
  assignedCourseId?: string;
  assignedDeviceId?: string;
  status?: string;
}

@Injectable()
export class StudentsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    userRole: string,
    userInstitutionId?: string,
    queryInstitutionId?: string,
    courseId?: string,
    search?: string
  ) {
    let targetInstId = userRole === 'SUPERADMIN' ? queryInstitutionId : userInstitutionId;

    let sql = `
      SELECT st.*, 
             co.code AS course_code, co.name AS course_name, co.grade AS course_grade, co.section AS course_section,
             d.hostname AS device_hostname, d.os_type AS device_os, d.status AS device_status
      FROM students st
      LEFT JOIN courses co ON st.assigned_course_id = co.id
      LEFT JOIN devices d ON st.assigned_device_id = d.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (targetInstId) {
      params.push(targetInstId);
      conditions.push(`st.institution_id = $${params.length}`);
    }

    if (courseId) {
      params.push(courseId);
      conditions.push(`st.assigned_course_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      conditions.push(`(LOWER(st.first_name) LIKE ${p} OR LOWER(st.last_name) LIKE ${p} OR LOWER(st.student_code) LIKE ${p})`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY st.last_name ASC, st.first_name ASC;';

    const res = await this.db.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, userRole: string, userInstitutionId?: string) {
    const res = await this.db.query(
      `SELECT st.*, 
              co.code AS course_code, co.name AS course_name,
              d.hostname AS device_hostname, d.os_type AS device_os
       FROM students st
       LEFT JOIN courses co ON st.assigned_course_id = co.id
       LEFT JOIN devices d ON st.assigned_device_id = d.id
       WHERE st.id = $1;`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Estudiante con id ${id} no encontrado`);
    }

    const student = res.rows[0];
    if (userRole !== 'SUPERADMIN' && userInstitutionId !== student.institution_id) {
      throw new ForbiddenException('No tiene permisos para consultar este estudiante');
    }

    // Attach device history
    const historyRes = await this.db.query(
      `SELECT sdh.*, d.hostname, d.os_type
       FROM student_device_history sdh
       JOIN devices d ON sdh.device_id = d.id
       WHERE sdh.student_id = $1
       ORDER BY sdh.assigned_at DESC;`,
      [id]
    );

    return {
      ...student,
      deviceHistory: historyRes.rows,
    };
  }

  async create(dto: CreateStudentDto, actorRole: string, actorInstitutionId?: string) {
    if (actorRole !== 'SUPERADMIN' && actorInstitutionId !== dto.institutionId) {
      throw new ForbiddenException('No tiene permisos para crear estudiantes en otra institución');
    }

    const check = await this.db.query(
      'SELECT id FROM students WHERE institution_id = $1 AND student_code = $2;',
      [dto.institutionId, dto.studentCode.trim().toUpperCase()]
    );
    if (check.rows.length > 0) {
      throw new ConflictException(`Ya existe un estudiante con el código '${dto.studentCode}' en esta institución`);
    }

    const newId = randomUUID();
    const insertRes = await this.db.query(
      `INSERT INTO students (
        id, institution_id, student_code, first_name, last_name, email,
        national_id, assigned_course_id, assigned_device_id, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *;`,
      [
        newId,
        dto.institutionId,
        dto.studentCode.trim().toUpperCase(),
        dto.firstName.trim(),
        dto.lastName.trim(),
        dto.email ? dto.email.trim().toLowerCase() : null,
        dto.nationalId ? dto.nationalId.trim() : null,
        dto.assignedCourseId || null,
        dto.assignedDeviceId || null,
        dto.status || 'active',
      ]
    );

    // If device assigned, update device and record in history
    if (dto.assignedDeviceId) {
      await this.assignDevice(newId, dto.assignedDeviceId, 'Alta inicial de estudiante', actorRole, actorInstitutionId);
    }

    return insertRes.rows[0];
  }

  async update(id: string, dto: UpdateStudentDto, actorRole: string, actorInstitutionId?: string) {
    const student = await this.findOne(id, actorRole, actorInstitutionId);

    const updateRes = await this.db.query(
      `UPDATE students SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        national_id = COALESCE($4, national_id),
        assigned_course_id = COALESCE($5, assigned_course_id),
        status = COALESCE($6, status),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *;`,
      [
        dto.firstName ? dto.firstName.trim() : null,
        dto.lastName ? dto.lastName.trim() : null,
        dto.email ? dto.email.trim().toLowerCase() : null,
        dto.nationalId ? dto.nationalId.trim() : null,
        dto.assignedCourseId || null,
        dto.status || null,
        id,
      ]
    );

    if (dto.assignedDeviceId !== undefined && dto.assignedDeviceId !== student.assigned_device_id) {
      if (dto.assignedDeviceId) {
        await this.assignDevice(id, dto.assignedDeviceId, 'Actualización de ficha de estudiante', actorRole, actorInstitutionId);
      } else {
        await this.unassignDevice(id, actorRole, actorInstitutionId);
      }
    }

    return updateRes.rows[0];
  }

  async delete(id: string, actorRole: string, actorInstitutionId?: string) {
    await this.findOne(id, actorRole, actorInstitutionId);
    await this.db.query('DELETE FROM students WHERE id = $1;', [id]);
    return { success: true, message: `Estudiante ${id} eliminado exitosamente` };
  }

  async assignDevice(studentId: string, deviceId: string, notes?: string, actorRole?: string, actorInstitutionId?: string) {
    const student = await this.findOne(studentId, actorRole || 'SUPERADMIN', actorInstitutionId);

    // Verify device exists in same institution
    const devRes = await this.db.query('SELECT id, institution_id, hostname FROM devices WHERE id = $1;', [deviceId]);
    if (devRes.rows.length === 0) throw new NotFoundException('Dispositivo no encontrado');
    if (devRes.rows[0].institution_id !== student.institution_id) {
      throw new BadRequestException('El dispositivo pertenece a otra institución');
    }

    // Unassign previous device if any
    await this.db.query(
      `UPDATE student_device_history SET unassigned_at = NOW() 
       WHERE student_id = $1 AND unassigned_at IS NULL;`,
      [studentId]
    );

    // Set student device
    await this.db.query('UPDATE students SET assigned_device_id = $1, updated_at = NOW() WHERE id = $2;', [deviceId, studentId]);

    // Set device current student
    await this.db.query('UPDATE devices SET current_student_id = $1, updated_at = NOW() WHERE id = $2;', [studentId, deviceId]);

    // Record history
    await this.db.query(
      `INSERT INTO student_device_history (institution_id, student_id, device_id, assigned_by, notes)
       VALUES ($1, $2, $3, $4, $5);`,
      [student.institution_id, studentId, deviceId, 'Administrator', notes || 'Asignación manual']
    );

    return { success: true, message: 'Dispositivo asignado exitosamente al estudiante' };
  }

  async unassignDevice(studentId: string, actorRole?: string, actorInstitutionId?: string) {
    const student = await this.findOne(studentId, actorRole || 'SUPERADMIN', actorInstitutionId);

    if (student.assigned_device_id) {
      await this.db.query(
        `UPDATE student_device_history SET unassigned_at = NOW() 
         WHERE student_id = $1 AND unassigned_at IS NULL;`,
        [studentId]
      );
      await this.db.query('UPDATE devices SET current_student_id = NULL WHERE id = $1;', [student.assigned_device_id]);
      await this.db.query('UPDATE students SET assigned_device_id = NULL, updated_at = NOW() WHERE id = $1;', [studentId]);
    }

    return { success: true, message: 'Dispositivo desasignado exitosamente' };
  }

  async importCsv(institutionId: string, csvContent: string, actorRole: string, actorInstitutionId?: string) {
    if (actorRole !== 'SUPERADMIN' && actorInstitutionId !== institutionId) {
      throw new ForbiddenException('No tiene permisos para importar estudiantes en otra institución');
    }

    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new BadRequestException('El archivo CSV debe contener una fila de encabezados y al menos un registro');
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const codeIdx = headers.indexOf('studentcode') !== -1 ? headers.indexOf('studentcode') : headers.indexOf('codigo');
    const firstIdx = headers.indexOf('firstname') !== -1 ? headers.indexOf('firstname') : headers.indexOf('nombre');
    const lastIdx = headers.indexOf('lastname') !== -1 ? headers.indexOf('lastname') : headers.indexOf('apellido');
    const emailIdx = headers.indexOf('email') !== -1 ? headers.indexOf('email') : headers.indexOf('correo');
    const courseIdx = headers.indexOf('coursecode') !== -1 ? headers.indexOf('coursecode') : headers.indexOf('curso');
    const natIdIdx = headers.indexOf('nationalid') !== -1 ? headers.indexOf('nationalid') : headers.indexOf('rut');

    if (codeIdx === -1 || firstIdx === -1 || lastIdx === -1) {
      throw new BadRequestException("El CSV debe contener al menos las columnas 'studentCode', 'firstName', 'lastName'");
    }

    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    // Pre-cache courses for this institution
    const coursesRes = await this.db.query('SELECT id, code FROM courses WHERE institution_id = $1;', [institutionId]);
    const courseMap = new Map<string, string>();
    for (const c of coursesRes.rows) {
      courseMap.set(c.code.toUpperCase(), c.id);
    }

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      const sCode = parts[codeIdx]?.toUpperCase();
      const fName = parts[firstIdx];
      const lName = parts[lastIdx];
      const email = emailIdx !== -1 ? parts[emailIdx] : null;
      const cCode = courseIdx !== -1 ? parts[courseIdx]?.toUpperCase() : null;
      const natId = natIdIdx !== -1 ? parts[natIdIdx] : null;

      if (!sCode || !fName || !lName) {
        errors.push(`Fila ${i + 1}: Datos obligatorios incompletos (código o nombres ausentes)`);
        continue;
      }

      const assignedCourseId = cCode && courseMap.has(cCode) ? courseMap.get(cCode) : null;

      // Upsert student
      const existing = await this.db.query(
        'SELECT id FROM students WHERE institution_id = $1 AND student_code = $2;',
        [institutionId, sCode]
      );

      if (existing.rows.length > 0) {
        await this.db.query(
          `UPDATE students SET
            first_name = $1, last_name = $2, email = COALESCE($3, email),
            national_id = COALESCE($4, national_id),
            assigned_course_id = COALESCE($5, assigned_course_id),
            updated_at = NOW()
           WHERE id = $6;`,
          [fName, lName, email || null, natId || null, assignedCourseId, existing.rows[0].id]
        );
        updatedCount++;
      } else {
        await this.db.query(
          `INSERT INTO students (
            id, institution_id, student_code, first_name, last_name, email,
            national_id, assigned_course_id, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW());`,
          [randomUUID(), institutionId, sCode, fName, lName, email || null, natId || null, assignedCourseId]
        );
        createdCount++;
      }
    }

    return {
      success: true,
      totalProcessed: lines.length - 1,
      createdCount,
      updatedCount,
      errors,
    };
  }

  async exportCsv(institutionId: string, courseId?: string) {
    let sql = `
      SELECT st.student_code, st.first_name, st.last_name, st.email, st.national_id, st.status,
             co.code AS course_code, d.hostname AS device_hostname
      FROM students st
      LEFT JOIN courses co ON st.assigned_course_id = co.id
      LEFT JOIN devices d ON st.assigned_device_id = d.id
      WHERE st.institution_id = $1
    `;
    const params: any[] = [institutionId];
    if (courseId) {
      sql += ' AND st.assigned_course_id = $2';
      params.push(courseId);
    }
    sql += ' ORDER BY st.last_name ASC, st.first_name ASC;';

    const res = await this.db.query(sql, params);
    const header = 'studentCode,firstName,lastName,email,nationalId,status,courseCode,assignedDevice\n';
    const rows = res.rows.map((r) =>
      `"${r.student_code}","${r.first_name}","${r.last_name}","${r.email || ''}","${r.national_id || ''}","${r.status}","${r.course_code || ''}","${r.device_hostname || ''}"`
    );

    return header + rows.join('\n');
  }
}
