import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'crypto';

export interface CreateClassroomInput {
  institutionId: string;
  name: string;
  code: string;
  capacity?: number;
  subnetLan?: string;
  broadcastIp?: string;
  physicalLocation?: string;
  description?: string;
  operationalStatus?: string;
  scheduleJson?: any[];
}

export interface UpdateClassroomInput {
  name?: string;
  code?: string;
  capacity?: number;
  subnetLan?: string;
  broadcastIp?: string;
  physicalLocation?: string;
  description?: string;
  operationalStatus?: string;
  scheduleJson?: any[];
}

@Injectable()
export class ClassroomsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(institutionId?: string) {
    let sql = `
      SELECT c.*,
             (SELECT count(*) FROM devices d WHERE d.current_classroom_id = c.id AND d.is_revoked = false) AS device_count,
             (SELECT count(*) FROM devices d WHERE d.current_classroom_id = c.id AND d.status = 'online' AND d.is_revoked = false) AS online_device_count,
             (SELECT count(*) FROM user_classrooms uc WHERE uc.classroom_id = c.id) AS assigned_teachers_count
      FROM classrooms c
    `;
    const params: any[] = [];
    if (institutionId) {
      sql += ' WHERE c.institution_id = $1';
      params.push(institutionId);
    }
    sql += ' ORDER BY c.name ASC;';
    const res = await this.databaseService.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, institutionId?: string) {
    let sql = `
      SELECT c.*,
             (SELECT count(*) FROM devices d WHERE d.current_classroom_id = c.id AND d.is_revoked = false) AS device_count,
             (SELECT count(*) FROM devices d WHERE d.current_classroom_id = c.id AND d.status = 'online' AND d.is_revoked = false) AS online_device_count
      FROM classrooms c 
      WHERE c.id = $1
    `;
    const params: any[] = [id];
    if (institutionId) {
      sql += ' AND c.institution_id = $2';
      params.push(institutionId);
    }
    const res = await this.databaseService.query(sql, params);
    if (res.rows.length === 0) {
      throw new NotFoundException(`Sala con id ${id} no encontrada`);
    }

    const room = res.rows[0];

    // Attach devices list (Windows + macOS mixed)
    const devicesRes = await this.databaseService.query(
      `SELECT d.id, d.hostname, d.device_name, d.local_ip, d.mac_address, d.os_type, d.os_version,
              d.architecture, d.status, d.processor, d.ram_mb, d.storage_gb, d.enrolled_at,
              st.id AS student_id, st.first_name AS student_first_name, st.last_name AS student_last_name
       FROM devices d
       LEFT JOIN students st ON d.current_student_id = st.id
       WHERE d.current_classroom_id = $1 AND d.is_revoked = false
       ORDER BY d.hostname ASC;`,
      [id]
    );

    // Attach teachers
    const teachersRes = await this.databaseService.query(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM user_classrooms uc
       JOIN users u ON uc.user_id = u.id
       WHERE uc.classroom_id = $1;`,
      [id]
    );

    return {
      ...room,
      devices: devicesRes.rows,
      assignedTeachers: teachersRes.rows,
    };
  }

  async create(dto: CreateClassroomInput) {
    const classroomCode = (dto.code && dto.code.trim()) 
      ? dto.code.trim().toUpperCase() 
      : `AULA-${randomUUID().substring(0, 6).toUpperCase()}`;

    const existing = await this.databaseService.query(
      'SELECT id FROM classrooms WHERE institution_id = $1 AND code = $2;',
      [dto.institutionId, classroomCode]
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Ya existe un aula con el código '${classroomCode}' en esta institución`);
    }

    const newId = randomUUID();
    const sched = dto.scheduleJson ? JSON.stringify(dto.scheduleJson) : '[]';

    const insertRes = await this.databaseService.query(
      `INSERT INTO classrooms (
        id, institution_id, name, code, capacity, subnet_lan, broadcast_ip,
        physical_location, description, operational_status, schedule_json,
        is_online, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, false, NOW(), NOW())
      RETURNING *;`,
      [
        newId,
        dto.institutionId,
        (dto.name || 'Aula Sin Nombre').trim(),
        classroomCode,
        dto.capacity || 30,
        dto.subnetLan || '192.168.1.0/24',
        dto.broadcastIp || '192.168.1.255',
        dto.physicalLocation ? dto.physicalLocation.trim() : null,
        dto.description ? dto.description.trim() : null,
        dto.operationalStatus || 'operational',
        sched,
      ]
    );

    return insertRes.rows[0];
  }

  async update(id: string, dto: UpdateClassroomInput, institutionId?: string) {
    await this.findOne(id, institutionId);

    const sched = dto.scheduleJson ? JSON.stringify(dto.scheduleJson) : null;

    const updateRes = await this.databaseService.query(
      `UPDATE classrooms SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        capacity = COALESCE($3, capacity),
        subnet_lan = COALESCE($4, subnet_lan),
        broadcast_ip = COALESCE($5, broadcast_ip),
        physical_location = COALESCE($6, physical_location),
        description = COALESCE($7, description),
        operational_status = COALESCE($8, operational_status),
        schedule_json = COALESCE($9::jsonb, schedule_json),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *;`,
      [
        dto.name ? dto.name.trim() : null,
        dto.code ? dto.code.trim().toUpperCase() : null,
        dto.capacity || null,
        dto.subnetLan || null,
        dto.broadcastIp || null,
        dto.physicalLocation ? dto.physicalLocation.trim() : null,
        dto.description ? dto.description.trim() : null,
        dto.operationalStatus || null,
        sched,
        id,
      ]
    );

    return updateRes.rows[0];
  }

  async delete(id: string, institutionId?: string) {
    await this.findOne(id, institutionId);
    // Unassign devices from this classroom before deleting
    await this.databaseService.query('UPDATE devices SET current_classroom_id = NULL WHERE current_classroom_id = $1;', [id]);
    await this.databaseService.query('DELETE FROM classrooms WHERE id = $1;', [id]);
    return { success: true, message: `Aula ${id} eliminada exitosamente` };
  }

  async assignTeachers(classroomId: string, userIds: string[], institutionId?: string) {
    const room = await this.findOne(classroomId, institutionId);

    const client = await this.databaseService.getPool().connect();
    try {
      await client.query('BEGIN;');
      await client.query('DELETE FROM user_classrooms WHERE classroom_id = $1;', [classroomId]);

      for (const uid of userIds) {
        await client.query(
          `INSERT INTO user_classrooms (institution_id, user_id, classroom_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, classroom_id) DO NOTHING;`,
          [room.institution_id, uid, classroomId]
        );
      }
      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }

    return this.findOne(classroomId, institutionId);
  }
}
