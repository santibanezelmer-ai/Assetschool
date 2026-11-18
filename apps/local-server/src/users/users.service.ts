import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

export interface CreateUserDto {
  institutionId: string;
  roleName: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  password?: string;
  phone?: string;
  isActive?: boolean;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  roleName?: string;
  isActive?: boolean;
  username?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userRole: string, userInstitutionId?: string, queryInstitutionId?: string) {
    let targetInstId: string | undefined = queryInstitutionId;
    if (userRole !== 'SUPERADMIN') {
      targetInstId = userInstitutionId;
    }

    let sql = `
      SELECT u.id, u.institution_id, u.email, u.username, u.first_name, u.last_name, 
             u.phone, u.is_active, u.must_change_password, u.last_login_at, u.created_at,
             r.name AS role_name, r.description AS role_description,
             i.name AS institution_name,
             (SELECT count(*) FROM user_classrooms uc WHERE uc.user_id = u.id) AS assigned_classrooms_count,
             (SELECT count(*) FROM user_courses uco WHERE uco.user_id = u.id) AS assigned_courses_count
      FROM users u
      JOIN roles r ON u.role_id = r.id
      JOIN institutions i ON u.institution_id = i.id
    `;
    const params: any[] = [];
    if (targetInstId) {
      sql += ' WHERE u.institution_id = $1';
      params.push(targetInstId);
    }
    sql += ' ORDER BY u.last_name ASC, u.first_name ASC;';

    const res = await this.db.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, userRole: string, userInstitutionId?: string) {
    const res = await this.db.query(
      `SELECT u.id, u.institution_id, u.email, u.username, u.first_name, u.last_name, 
              u.phone, u.is_active, u.must_change_password, u.last_login_at, u.created_at,
              r.name AS role_name, r.description AS role_description,
              i.name AS institution_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       JOIN institutions i ON u.institution_id = i.id
       WHERE u.id = $1;`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    const user = res.rows[0];
    if (userRole !== 'SUPERADMIN' && userInstitutionId !== user.institution_id) {
      throw new ForbiddenException('No tiene permisos para ver este usuario');
    }

    // Attach assigned classrooms and courses
    const classroomsRes = await this.db.query(
      `SELECT c.id, c.code, c.name, c.capacity, c.physical_location
       FROM user_classrooms uc
       JOIN classrooms c ON uc.classroom_id = c.id
       WHERE uc.user_id = $1;`,
      [id]
    );

    const coursesRes = await this.db.query(
      `SELECT co.id, co.code, co.name, co.education_level, co.grade, co.section, uco.is_lead_teacher
       FROM user_courses uco
       JOIN courses co ON uco.course_id = co.id
       WHERE uco.user_id = $1;`,
      [id]
    );

    return {
      ...user,
      assignedClassrooms: classroomsRes.rows,
      assignedCourses: coursesRes.rows,
    };
  }

  async create(dto: CreateUserDto, actorRole: string, actorInstitutionId?: string) {
    if (actorRole !== 'SUPERADMIN' && actorInstitutionId !== dto.institutionId) {
      throw new ForbiddenException('No tiene permisos para crear usuarios en otra institución');
    }

    // Check email uniqueness within institution
    const emailCheck = await this.db.query(
      'SELECT id FROM users WHERE institution_id = $1 AND email = $2;',
      [dto.institutionId, dto.email.trim().toLowerCase()]
    );
    if (emailCheck.rows.length > 0) {
      throw new ConflictException(`El correo '${dto.email}' ya se encuentra registrado en esta institución`);
    }

    // Resolve role name flexibly (role or roleName)
    const targetRoleName = ((dto as any).role || dto.roleName || '').toString().trim().toUpperCase();
    if (!targetRoleName) {
      throw new BadRequestException('El rol es requerido');
    }

    const roleRes = await this.db.query('SELECT id, name FROM roles WHERE name = $1;', [targetRoleName]);
    if (roleRes.rows.length === 0) {
      throw new BadRequestException(`El rol '${targetRoleName}' no es válido`);
    }
    const roleId = roleRes.rows[0].id;

    // Resolve names flexibly (firstName/lastName or fullName)
    let fName = (dto.firstName || '').trim();
    let lName = (dto.lastName || '').trim();
    if (!fName && (dto as any).fullName) {
      const parts = (dto as any).fullName.trim().split(' ');
      fName = parts[0] || 'Usuario';
      lName = parts.slice(1).join(' ') || 'AssetSchool';
    }

    // Default password if not provided: TempPass2026!
    const plainPass = dto.password || 'TempPass2026!';
    const passwordHash = await bcrypt.hash(plainPass, 10);
    const newId = randomUUID();

    const insertRes = await this.db.query(
      `INSERT INTO users (
        id, institution_id, role_id, email, username, password_hash,
        first_name, last_name, phone, is_active, must_change_password,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      RETURNING id, institution_id, email, username, first_name, last_name, phone, is_active;`,
      [
        newId,
        dto.institutionId,
        roleId,
        dto.email.trim().toLowerCase(),
        dto.username ? dto.username.trim().toLowerCase() : dto.email.split('@')[0],
        passwordHash,
        fName,
        lName,
        dto.phone ? dto.phone.trim() : null,
        dto.isActive !== undefined ? dto.isActive : true,
      ]
    );

    return insertRes.rows[0];
  }

  async update(id: string, dto: UpdateUserDto, actorRole: string, actorInstitutionId?: string) {
    const existing = await this.findOne(id, actorRole, actorInstitutionId);

    let roleId: string | null = null;
    if (dto.roleName) {
      const roleRes = await this.db.query('SELECT id FROM roles WHERE name = $1;', [dto.roleName.toUpperCase()]);
      if (roleRes.rows.length === 0) throw new BadRequestException(`Rol '${dto.roleName}' inválido`);
      roleId = roleRes.rows[0].id;
    }

    const updateRes = await this.db.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        phone = COALESCE($3, phone),
        username = COALESCE($4, username),
        role_id = COALESCE($5, role_id),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
       WHERE id = $7
       RETURNING id, institution_id, email, username, first_name, last_name, phone, is_active;`,
      [
        dto.firstName ? dto.firstName.trim() : null,
        dto.lastName ? dto.lastName.trim() : null,
        dto.phone ? dto.phone.trim() : null,
        dto.username ? dto.username.trim().toLowerCase() : null,
        roleId,
        dto.isActive !== undefined ? dto.isActive : null,
        id,
      ]
    );

    return updateRes.rows[0];
  }

  async setStatus(id: string, isActive: boolean, actorRole: string, actorInstitutionId?: string) {
    await this.findOne(id, actorRole, actorInstitutionId);
    const res = await this.db.query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active;`,
      [isActive, id]
    );
    return res.rows[0];
  }

  async resetPassword(id: string, newPass: string | undefined, actorRole: string, actorInstitutionId?: string) {
    await this.findOne(id, actorRole, actorInstitutionId);
    const plain = newPass || 'AssetSchool2026!';
    const passwordHash = await bcrypt.hash(plain, 10);

    await this.db.query(
      `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2;`,
      [passwordHash, id]
    );

    return { success: true, message: 'Contraseña restablecida exitosamente. Se solicitará cambio en próximo acceso.' };
  }

  async assignClassrooms(userId: string, classroomIds: string[], actorRole: string, actorInstitutionId?: string) {
    const user = await this.findOne(userId, actorRole, actorInstitutionId);

    // Atomic transaction for assignments
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN;');
      await client.query('DELETE FROM user_classrooms WHERE user_id = $1;', [userId]);

      for (const roomId of classroomIds) {
        await client.query(
          `INSERT INTO user_classrooms (institution_id, user_id, classroom_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, classroom_id) DO NOTHING;`,
          [user.institution_id, userId, roomId]
        );
      }
      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }

    return this.findOne(userId, actorRole, actorInstitutionId);
  }

  async assignCourses(
    userId: string,
    courses: { courseId: string; isLeadTeacher?: boolean }[],
    actorRole: string,
    actorInstitutionId?: string
  ) {
    const user = await this.findOne(userId, actorRole, actorInstitutionId);

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN;');
      await client.query('DELETE FROM user_courses WHERE user_id = $1;', [userId]);

      for (const item of courses) {
        await client.query(
          `INSERT INTO user_courses (institution_id, user_id, course_id, is_lead_teacher)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, course_id) DO NOTHING;`,
          [user.institution_id, userId, item.courseId, !!item.isLeadTeacher]
        );
      }
      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }

    return this.findOne(userId, actorRole, actorInstitutionId);
  }
}
