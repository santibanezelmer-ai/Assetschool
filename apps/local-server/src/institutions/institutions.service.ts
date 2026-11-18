import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'crypto';

export interface CreateInstitutionDto {
  name: string;
  code: string;
  rut?: string;
  address?: string;
  region?: string;
  comuna?: string;
  contactEmail: string;
  contactPhone?: string;
  settingsJson?: Record<string, any>;
}

export interface UpdateInstitutionDto {
  name?: string;
  rut?: string;
  address?: string;
  region?: string;
  comuna?: string;
  contactEmail?: string;
  contactPhone?: string;
  settingsJson?: Record<string, any>;
  isActive?: boolean;
}

@Injectable()
export class InstitutionsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userRole: string, userInstitutionId?: string) {
    if (userRole === 'SUPERADMIN') {
      const res = await this.db.query(
        `SELECT i.*, 
                (SELECT count(*) FROM users u WHERE u.institution_id = i.id) AS user_count,
                (SELECT count(*) FROM classrooms c WHERE c.institution_id = i.id) AS classroom_count,
                (SELECT count(*) FROM devices d WHERE d.institution_id = i.id) AS device_count
         FROM institutions i 
         ORDER BY i.name ASC;`
      );
      return res.rows;
    }

    if (!userInstitutionId) {
      throw new ForbiddenException('Institución no identificada en el contexto del usuario');
    }

    const res = await this.db.query(
      `SELECT i.*, 
              (SELECT count(*) FROM users u WHERE u.institution_id = i.id) AS user_count,
              (SELECT count(*) FROM classrooms c WHERE c.institution_id = i.id) AS classroom_count,
              (SELECT count(*) FROM devices d WHERE d.institution_id = i.id) AS device_count
       FROM institutions i 
       WHERE i.id = $1;`,
      [userInstitutionId]
    );
    return res.rows;
  }

  async findOne(id: string, userRole: string, userInstitutionId?: string) {
    if (userRole !== 'SUPERADMIN' && userInstitutionId !== id) {
      throw new ForbiddenException('No tiene permisos para consultar esta institución');
    }

    const res = await this.db.query(
      `SELECT i.*,
              (SELECT count(*) FROM users u WHERE u.institution_id = i.id) AS user_count,
              (SELECT count(*) FROM classrooms c WHERE c.institution_id = i.id) AS classroom_count,
              (SELECT count(*) FROM devices d WHERE d.institution_id = i.id) AS device_count,
              (SELECT count(*) FROM courses co WHERE co.institution_id = i.id) AS course_count,
              (SELECT count(*) FROM students st WHERE st.institution_id = i.id) AS student_count
       FROM institutions i 
       WHERE i.id = $1;`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Institución con id ${id} no encontrada`);
    }

    return res.rows[0];
  }

  async create(dto: CreateInstitutionDto) {
    const existing = await this.db.query('SELECT id FROM institutions WHERE code = $1;', [dto.code]);
    if (existing.rows.length > 0) {
      throw new ConflictException(`Ya existe una institución con el código '${dto.code}'`);
    }

    const newId = randomUUID();
    const settings = dto.settingsJson ? JSON.stringify(dto.settingsJson) : '{}';

    const insertRes = await this.db.query(
      `INSERT INTO institutions (
        id, code, name, rut, address, region, comuna, 
        contact_email, contact_phone, settings_json, is_active, 
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      RETURNING *;`,
      [
        newId,
        dto.code.trim().toUpperCase(),
        dto.name.trim(),
        dto.rut ? dto.rut.trim() : null,
        dto.address ? dto.address.trim() : null,
        dto.region ? dto.region.trim() : null,
        dto.comuna ? dto.comuna.trim() : null,
        dto.contactEmail.trim().toLowerCase(),
        dto.contactPhone ? dto.contactPhone.trim() : null,
        settings,
      ]
    );

    return insertRes.rows[0];
  }

  async update(id: string, dto: UpdateInstitutionDto, userRole: string, userInstitutionId?: string) {
    if (userRole !== 'SUPERADMIN' && userInstitutionId !== id) {
      throw new ForbiddenException('No tiene permisos para modificar esta institución');
    }

    const current = await this.findOne(id, userRole, userInstitutionId);
    const settings = dto.settingsJson ? JSON.stringify(dto.settingsJson) : JSON.stringify(current.settings_json || {});

    const updateRes = await this.db.query(
      `UPDATE institutions SET
        name = COALESCE($1, name),
        rut = COALESCE($2, rut),
        address = COALESCE($3, address),
        region = COALESCE($4, region),
        comuna = COALESCE($5, comuna),
        contact_email = COALESCE($6, contact_email),
        contact_phone = COALESCE($7, contact_phone),
        settings_json = $8::jsonb,
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *;`,
      [
        dto.name ? dto.name.trim() : null,
        dto.rut ? dto.rut.trim() : null,
        dto.address ? dto.address.trim() : null,
        dto.region ? dto.region.trim() : null,
        dto.comuna ? dto.comuna.trim() : null,
        dto.contactEmail ? dto.contactEmail.trim().toLowerCase() : null,
        dto.contactPhone ? dto.contactPhone.trim() : null,
        settings,
        dto.isActive !== undefined ? dto.isActive : null,
        id,
      ]
    );

    return updateRes.rows[0];
  }

  async setStatus(id: string, isActive: boolean) {
    const res = await this.db.query(
      `UPDATE institutions SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *;`,
      [isActive, id]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Institución con id ${id} no encontrada`);
    }
    return res.rows[0];
  }
}
