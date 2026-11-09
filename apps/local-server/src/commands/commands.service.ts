import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DispatchCommand } from '@assetschool/validators';
import { CommandStatus, DeviceStatus } from '@assetschool/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class CommandsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async dispatch(dto: DispatchCommand, issuerUserId: string, issuerEmail: string, institutionId?: string) {
    const createdCommands: any[] = [];

    for (const deviceId of dto.deviceIds) {
      const devRes = await this.databaseService.query(
        'SELECT id, hostname, is_revoked, institution_id FROM devices WHERE id = $1',
        [deviceId],
      );

      if (devRes.rows.length === 0) {
        throw new BadRequestException(`Dispositivo con id ${deviceId} no existe`);
      }

      const device = devRes.rows[0];
      if (device.is_revoked) {
        throw new BadRequestException(`El dispositivo ${device.hostname} está revocado`);
      }

      if (institutionId && device.institution_id !== institutionId) {
        throw new BadRequestException('Aislamiento institucional: no se puede emitir comandos a otra institución');
      }

      const commandId = randomUUID();
      await this.databaseService.query(
        `INSERT INTO commands (
           id, classroom_session_id, device_id, issuer_user_id, command_type,
           payload_json, status, issued_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          commandId,
          dto.classroomSessionId || null,
          device.id,
          issuerUserId,
          dto.commandType,
          JSON.stringify(dto.params || {}),
          CommandStatus.ACKNOWLEDGED,
        ],
      );

      // Reflect state change if locking / unlocking
      if (dto.commandType === 'LOCK_SCREEN') {
        await this.databaseService.query('UPDATE devices SET status = $1 WHERE id = $2', [
          DeviceStatus.LOCKED,
          device.id,
        ]);
      } else if (dto.commandType === 'UNLOCK_SCREEN') {
        await this.databaseService.query('UPDATE devices SET status = $1 WHERE id = $2', [
          DeviceStatus.ONLINE,
          device.id,
        ]);
      }

      createdCommands.push({
        id: commandId,
        deviceId: device.id,
        issuerUserId,
        commandType: dto.commandType,
        status: CommandStatus.ACKNOWLEDGED,
        issuedAt: new Date().toISOString(),
      });
    }

    // Insert audit log
    const instId = institutionId || (await this.resolveDefaultInstitutionId());
    await this.databaseService.query(
      `INSERT INTO audit_logs (id, institution_id, actor_user_id, action, entity_type, details_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        randomUUID(),
        instId,
        issuerUserId,
        `COMMAND_${dto.commandType}`,
        'COMMAND',
        JSON.stringify({
          actor: issuerEmail,
          deviceCount: dto.deviceIds.length,
          commandType: dto.commandType,
        }),
      ],
    );

    return {
      success: true,
      dispatchedCount: createdCommands.length,
      commands: createdCommands,
    };
  }

  async listRecent(institutionId?: string) {
    let sql = `
      SELECT c.*, d.hostname, u.email as issuer_email
      FROM commands c
      JOIN devices d ON c.device_id = d.id
      JOIN users u ON c.issuer_user_id = u.id
    `;
    const params: any[] = [];
    if (institutionId) {
      sql += ' WHERE d.institution_id = $1';
      params.push(institutionId);
    }
    sql += ' ORDER BY c.issued_at DESC LIMIT 50';

    const res = await this.databaseService.query(sql, params);
    return res.rows;
  }

  private async resolveDefaultInstitutionId(): Promise<string> {
    const res = await this.databaseService.query('SELECT id FROM institutions LIMIT 1');
    return res.rows[0]?.id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  }
}
