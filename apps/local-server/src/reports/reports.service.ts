import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async getExecutiveSummary(institutionId?: string) {
    const params: any[] = [];
    let instFilter = '';
    if (institutionId) {
      params.push(institutionId);
      instFilter = ' WHERE institution_id = $1';
    }

    const [instRes, usersRes, classRes, courseRes, studRes, devRes] = await Promise.all([
      this.db.query(`SELECT count(*) AS count FROM institutions WHERE is_active = true;`),
      this.db.query(`SELECT count(*) AS count, role_id FROM users ${instFilter} GROUP BY role_id;`, params),
      this.db.query(`SELECT count(*) AS count FROM classrooms ${instFilter};`, params),
      this.db.query(`SELECT count(*) AS count FROM courses ${instFilter};`, params),
      this.db.query(`SELECT count(*) AS count, status FROM students ${instFilter} GROUP BY status;`, params),
      this.db.query(`SELECT count(*) AS count, os_type, status FROM devices ${instFilter} GROUP BY os_type, status;`, params),
    ]);

    // Role mapping
    const rolesRes = await this.db.query('SELECT id, name FROM roles;');
    const roleNameMap = new Map<string, string>();
    rolesRes.rows.forEach((r) => roleNameMap.set(r.id, r.name));

    const usersByRole: Record<string, number> = {};
    usersRes.rows.forEach((r) => {
      const rName = roleNameMap.get(r.role_id) || 'OTHER';
      usersByRole[rName] = (usersByRole[rName] || 0) + parseInt(r.count, 10);
    });

    const devicesByOs: Record<string, number> = {};
    const devicesByStatus: Record<string, number> = {};
    devRes.rows.forEach((r) => {
      devicesByOs[r.os_type] = (devicesByOs[r.os_type] || 0) + parseInt(r.count, 10);
      devicesByStatus[r.status] = (devicesByStatus[r.status] || 0) + parseInt(r.count, 10);
    });

    const studentsByStatus: Record<string, number> = {};
    studRes.rows.forEach((r) => {
      studentsByStatus[r.status] = (studentsByStatus[r.status] || 0) + parseInt(r.count, 10);
    });

    return {
      activeInstitutions: parseInt(instRes.rows[0]?.count || '1', 10),
      totalClassrooms: parseInt(classRes.rows[0]?.count || '0', 10),
      totalCourses: parseInt(courseRes.rows[0]?.count || '0', 10),
      usersByRole,
      devicesByOs,
      devicesByStatus,
      studentsByStatus,
      generatedAt: new Date().toISOString(),
    };
  }

  async getClassroomsOccupancy(institutionId?: string) {
    let sql = `
      SELECT c.id, c.code, c.name, c.capacity, c.physical_location, c.operational_status,
             COUNT(d.id) AS assigned_devices_count,
             COUNT(CASE WHEN d.status = 'online' THEN 1 END) AS online_devices_count,
             ROUND((COUNT(d.id)::numeric / NULLIF(c.capacity, 0)::numeric) * 100, 1) AS occupancy_percentage
      FROM classrooms c
      LEFT JOIN devices d ON c.id = d.current_classroom_id AND d.is_revoked = false
    `;
    const params: any[] = [];
    if (institutionId) {
      params.push(institutionId);
      sql += ' WHERE c.institution_id = $1';
    }
    sql += ' GROUP BY c.id ORDER BY c.name ASC;';

    const res = await this.db.query(sql, params);
    return res.rows;
  }

  async getInventoryHardwareReport(institutionId?: string) {
    let sql = `
      SELECT d.id, d.hostname, d.device_name, d.os_type, d.os_version, d.architecture,
             d.processor, d.ram_mb, d.storage_gb, d.status, d.local_ip, d.mac_address,
             c.name AS classroom_name,
             st.first_name AS student_first_name, st.last_name AS student_last_name
      FROM devices d
      LEFT JOIN classrooms c ON d.current_classroom_id = c.id
      LEFT JOIN students st ON d.current_student_id = st.id
      WHERE d.is_revoked = false
    `;
    const params: any[] = [];
    if (institutionId) {
      params.push(institutionId);
      sql += ' AND d.institution_id = $1';
    }
    sql += ' ORDER BY d.os_type ASC, d.hostname ASC;';

    const res = await this.db.query(sql, params);
    return res.rows;
  }
}
