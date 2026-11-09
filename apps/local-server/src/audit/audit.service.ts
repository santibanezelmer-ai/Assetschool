import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(institutionId?: string) {
    let sql = `
      SELECT a.*, u.email as actor_email, u.first_name || ' ' || u.last_name as actor_name
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
    `;
    const params: any[] = [];
    if (institutionId) {
      sql += ' WHERE a.institution_id = $1';
      params.push(institutionId);
    }
    sql += ' ORDER BY a.timestamp DESC LIMIT 100';

    const res = await this.databaseService.query(sql, params);
    return res.rows;
  }
}
