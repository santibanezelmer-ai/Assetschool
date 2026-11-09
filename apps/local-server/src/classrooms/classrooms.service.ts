import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateClassroom } from '@assetschool/validators';
import { randomUUID } from 'crypto';

@Injectable()
export class ClassroomsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(institutionId?: string) {
    let sql = 'SELECT * FROM classrooms';
    const params: any[] = [];
    if (institutionId) {
      sql += ' WHERE institution_id = $1';
      params.push(institutionId);
    }
    sql += ' ORDER BY name ASC';
    const res = await this.databaseService.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, institutionId?: string) {
    let sql = 'SELECT * FROM classrooms WHERE id = $1';
    const params: any[] = [id];
    if (institutionId) {
      sql += ' AND institution_id = $2';
      params.push(institutionId);
    }
    const res = await this.databaseService.query(sql, params);
    if (res.rows.length === 0) {
      throw new NotFoundException(`Sala con id ${id} no encontrada`);
    }
    return res.rows[0];
  }

  async create(dto: CreateClassroom) {
    const newId = randomUUID();
    await this.databaseService.query(
      `INSERT INTO classrooms (id, institution_id, name, code, capacity, subnet_lan, broadcast_ip, is_online, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW(), NOW())`,
      [
        newId,
        dto.institutionId,
        dto.name,
        dto.code,
        dto.capacity,
        dto.subnetLan || '192.168.1.0/24',
        dto.broadcastIp || '192.168.1.255',
      ],
    );

    return this.findOne(newId);
  }
}
