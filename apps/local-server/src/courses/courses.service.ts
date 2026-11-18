import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'crypto';

export interface CreateCourseDto {
  institutionId: string;
  code: string;
  name: string;
  description?: string;
  educationLevel?: string;
  grade?: string;
  section?: string;
  academicYear?: number;
  academicPeriod?: string;
  leadTeacherId?: string;
}

export interface UpdateCourseDto {
  name?: string;
  description?: string;
  educationLevel?: string;
  grade?: string;
  section?: string;
  academicYear?: number;
  academicPeriod?: string;
  leadTeacherId?: string;
  isActive?: boolean;
}

@Injectable()
export class CoursesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userRole: string, userInstitutionId?: string, queryInstitutionId?: string, academicYear?: number) {
    let targetInstId = userRole === 'SUPERADMIN' ? queryInstitutionId : userInstitutionId;

    let sql = `
      SELECT co.*, 
             u.first_name AS lead_teacher_first_name, 
             u.last_name AS lead_teacher_last_name,
             u.email AS lead_teacher_email,
             (SELECT count(*) FROM students st WHERE st.assigned_course_id = co.id) AS enrolled_students_count,
             (SELECT count(*) FROM user_courses uco WHERE uco.course_id = co.id) AS teachers_count
      FROM courses co
      LEFT JOIN users u ON co.lead_teacher_id = u.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (targetInstId) {
      params.push(targetInstId);
      conditions.push(`co.institution_id = $${params.length}`);
    }

    if (academicYear) {
      params.push(academicYear);
      conditions.push(`co.academic_year = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY co.academic_year DESC, co.grade ASC, co.section ASC, co.name ASC;';

    const res = await this.db.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, userRole: string, userInstitutionId?: string) {
    const res = await this.db.query(
      `SELECT co.*, 
              u.first_name AS lead_teacher_first_name, 
              u.last_name AS lead_teacher_last_name,
              u.email AS lead_teacher_email,
              (SELECT count(*) FROM students st WHERE st.assigned_course_id = co.id) AS enrolled_students_count
       FROM courses co
       LEFT JOIN users u ON co.lead_teacher_id = u.id
       WHERE co.id = $1;`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Curso con id ${id} no encontrado`);
    }

    const course = res.rows[0];
    if (userRole !== 'SUPERADMIN' && userInstitutionId !== course.institution_id) {
      throw new ForbiddenException('No tiene permisos para consultar este curso');
    }

    // Attach students and teachers
    const studentsRes = await this.db.query(
      `SELECT st.id, st.student_code, st.first_name, st.last_name, st.email, st.status,
              st.assigned_device_id, d.hostname AS assigned_device_hostname
       FROM students st
       LEFT JOIN devices d ON st.assigned_device_id = d.id
       WHERE st.assigned_course_id = $1
       ORDER BY st.last_name ASC, st.first_name ASC;`,
      [id]
    );

    const teachersRes = await this.db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, uco.is_lead_teacher
       FROM user_courses uco
       JOIN users u ON uco.user_id = u.id
       WHERE uco.course_id = $1;`,
      [id]
    );

    return {
      ...course,
      enrolledStudents: studentsRes.rows,
      assignedTeachers: teachersRes.rows,
    };
  }

  async create(dto: CreateCourseDto, actorRole: string, actorInstitutionId?: string) {
    if (actorRole !== 'SUPERADMIN' && actorInstitutionId !== dto.institutionId) {
      throw new ForbiddenException('No tiene permisos para crear cursos en otra institución');
    }

    const check = await this.db.query(
      'SELECT id FROM courses WHERE institution_id = $1 AND code = $2;',
      [dto.institutionId, dto.code.trim().toUpperCase()]
    );
    if (check.rows.length > 0) {
      throw new ConflictException(`Ya existe un curso con el código '${dto.code}' en esta institución`);
    }

    const newId = randomUUID();
    const period = dto.academicPeriod || `${dto.academicYear || 2026}-S1`;

    const insertRes = await this.db.query(
      `INSERT INTO courses (
        id, institution_id, code, name, description, academic_period,
        education_level, grade, section, academic_year, lead_teacher_id,
        is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
      RETURNING *;`,
      [
        newId,
        dto.institutionId,
        dto.code.trim().toUpperCase(),
        dto.name.trim(),
        dto.description ? dto.description.trim() : null,
        period,
        dto.educationLevel ? dto.educationLevel.trim() : 'Educación General',
        dto.grade ? dto.grade.trim() : '1°',
        dto.section ? dto.section.trim().toUpperCase() : 'A',
        dto.academicYear || 2026,
        dto.leadTeacherId || null,
      ]
    );

    // If lead teacher specified, add to user_courses
    if (dto.leadTeacherId) {
      await this.db.query(
        `INSERT INTO user_courses (institution_id, user_id, course_id, is_lead_teacher)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (user_id, course_id) DO NOTHING;`,
        [dto.institutionId, dto.leadTeacherId, newId]
      );
    }

    return insertRes.rows[0];
  }

  async update(id: string, dto: UpdateCourseDto, actorRole: string, actorInstitutionId?: string) {
    await this.findOne(id, actorRole, actorInstitutionId);

    const updateRes = await this.db.query(
      `UPDATE courses SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        education_level = COALESCE($3, education_level),
        grade = COALESCE($4, grade),
        section = COALESCE($5, section),
        academic_year = COALESCE($6, academic_year),
        academic_period = COALESCE($7, academic_period),
        lead_teacher_id = COALESCE($8, lead_teacher_id),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *;`,
      [
        dto.name ? dto.name.trim() : null,
        dto.description ? dto.description.trim() : null,
        dto.educationLevel ? dto.educationLevel.trim() : null,
        dto.grade ? dto.grade.trim() : null,
        dto.section ? dto.section.trim().toUpperCase() : null,
        dto.academicYear || null,
        dto.academicPeriod ? dto.academicPeriod.trim() : null,
        dto.leadTeacherId || null,
        dto.isActive !== undefined ? dto.isActive : null,
        id,
      ]
    );

    return updateRes.rows[0];
  }

  async delete(id: string, actorRole: string, actorInstitutionId?: string) {
    await this.findOne(id, actorRole, actorInstitutionId);
    await this.db.query('DELETE FROM courses WHERE id = $1;', [id]);
    return { success: true, message: `Curso con id ${id} eliminado exitosamente` };
  }
}
