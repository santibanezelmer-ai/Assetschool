import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AgentRegistration } from '@assetschool/validators';
import { DeviceStatus } from '@assetschool/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(classroomId?: string, includeDemo: boolean = true, institutionId?: string) {
    let sql = `SELECT * FROM devices WHERE 1=1`;
    const params: any[] = [];

    if (institutionId) {
      params.push(institutionId);
      sql += ` AND institution_id = $${params.length}`;
    }

    if (!includeDemo) {
      sql += ` AND is_demo = false`;
    }

    if (classroomId) {
      params.push(classroomId);
      sql += ` AND current_classroom_id = $${params.length}`;
    }

    sql += ` ORDER BY hostname ASC`;

    const res = await this.databaseService.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, institutionId?: string) {
    let sql = `SELECT * FROM devices WHERE id = $1`;
    const params: any[] = [id];

    if (institutionId) {
      sql += ` AND institution_id = $2`;
      params.push(institutionId);
    }

    const res = await this.databaseService.query(sql, params);
    if (res.rows.length === 0) {
      throw new NotFoundException(`Dispositivo con id ${id} no encontrado`);
    }
    return res.rows[0];
  }

  async registerAgent(dto: AgentRegistration) {
    // 1. Resolve institution by code
    const instRes = await this.databaseService.query(
      'SELECT id FROM institutions WHERE code = $1',
      [dto.institutionCode],
    );

    if (instRes.rows.length === 0) {
      throw new BadRequestException(
        `Institución con código '${dto.institutionCode}' no está registrada en el servidor`,
      );
    }

    const institutionId = instRes.rows[0].id;

    // 2. Check if device MAC exists
    const existingRes = await this.databaseService.query(
      'SELECT * FROM devices WHERE institution_id = $1 AND LOWER(mac_address) = LOWER($2)',
      [institutionId, dto.macAddress],
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.is_revoked) {
        throw new BadRequestException(
          'Dispositivo revocado por el administrador de red. Contacte a soporte TIC.',
        );
      }

      await this.databaseService.query(
        `UPDATE devices 
         SET local_ip = $1, hostname = $2, os_version = $3, status = $4, last_heartbeat_at = NOW(), updated_at = NOW()
         WHERE id = $5`,
        [dto.localIp, dto.hostname, dto.osVersion, DeviceStatus.ONLINE, existing.id],
      );

      // Upsert device_capabilities
      await this.databaseService.query(
        `INSERT INTO device_capabilities (
           id, device_id, can_screen_broadcast, can_screen_receive, can_remote_input,
           can_lock_input, can_blackout_screen, can_file_transfer, can_process_block,
           can_url_block, can_chat, can_execute_command, can_collect_hardware_inventory, platform_notes, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           can_screen_broadcast = EXCLUDED.can_screen_broadcast,
           can_screen_receive = EXCLUDED.can_screen_receive,
           can_remote_input = EXCLUDED.can_remote_input,
           can_lock_input = EXCLUDED.can_lock_input,
           can_blackout_screen = EXCLUDED.can_blackout_screen,
           can_file_transfer = EXCLUDED.can_file_transfer,
           can_process_block = EXCLUDED.can_process_block,
           can_url_block = EXCLUDED.can_url_block,
           can_chat = EXCLUDED.can_chat,
           can_execute_command = EXCLUDED.can_execute_command,
           can_collect_hardware_inventory = EXCLUDED.can_collect_hardware_inventory,
           platform_notes = EXCLUDED.platform_notes,
           updated_at = NOW()`,
        [
          randomUUID(),
          existing.id,
          dto.capabilities.canScreenBroadcast,
          dto.capabilities.canScreenReceive,
          dto.capabilities.canRemoteInput,
          dto.capabilities.canLockInput,
          dto.capabilities.canBlackoutScreen,
          dto.capabilities.canFileTransfer,
          dto.capabilities.canProcessBlock,
          dto.capabilities.canUrlBlock,
          dto.capabilities.canChat,
          dto.capabilities.canExecuteCommand,
          dto.capabilities.canCollectHardwareInventory,
          dto.capabilities.platformNotes || '',
        ],
      );

      return {
        isEnrolled: true,
        deviceId: existing.id,
        message: 'Dispositivo re-conectado exitosamente',
      };
    }

    // 3. New Device Enrollment
    const newDeviceId = randomUUID();
    await this.databaseService.query(
      `INSERT INTO devices (
         id, institution_id, hostname, mac_address, local_ip, os_type, os_version,
         architecture, hardware_serial, status, is_revoked, is_demo, enrolled_at, last_heartbeat_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false, NOW(), NOW())`,
      [
        newDeviceId,
        institutionId,
        dto.hostname,
        dto.macAddress,
        dto.localIp,
        dto.osType,
        dto.osVersion,
        dto.architecture,
        dto.hardwareSerial || null,
        DeviceStatus.ONLINE,
      ],
    );

    // Insert agent public key
    await this.databaseService.query(
      `INSERT INTO device_agents (id, device_id, agent_version, protocol_version, public_key, last_handshake_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [randomUUID(), newDeviceId, dto.agentVersion, '1.0.0', dto.publicKey],
    );

    // Insert capabilities
    await this.databaseService.query(
      `INSERT INTO device_capabilities (
         id, device_id, can_screen_broadcast, can_screen_receive, can_remote_input,
         can_lock_input, can_blackout_screen, can_file_transfer, can_process_block,
         can_url_block, can_chat, can_execute_command, can_collect_hardware_inventory, platform_notes, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        randomUUID(),
        newDeviceId,
        dto.capabilities.canScreenBroadcast,
        dto.capabilities.canScreenReceive,
        dto.capabilities.canRemoteInput,
        dto.capabilities.canLockInput,
        dto.capabilities.canBlackoutScreen,
        dto.capabilities.canFileTransfer,
        dto.capabilities.canProcessBlock,
        dto.capabilities.canUrlBlock,
        dto.capabilities.canChat,
        dto.capabilities.canExecuteCommand,
        dto.capabilities.canCollectHardwareInventory,
        dto.capabilities.platformNotes || '',
      ],
    );

    // Audit log
    await this.databaseService.query(
      `INSERT INTO audit_logs (id, institution_id, action, entity_type, entity_id, details_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        randomUUID(),
        institutionId,
        'DEVICE_ENROLLED',
        'DEVICE',
        newDeviceId,
        JSON.stringify({ hostname: dto.hostname, mac: dto.macAddress, ip: dto.localIp }),
      ],
    );

    this.logger.log(`Nuevo equipo enrolado: ${dto.hostname} (${dto.osType}) - MAC: ${dto.macAddress}`);

    return {
      isEnrolled: true,
      deviceId: newDeviceId,
      message: 'Dispositivo enrolado por primera vez en la red institucional',
    };
  }

  async revokeDevice(id: string, reason: string, actorEmail: string, institutionId?: string) {
    const devRes = await this.databaseService.query(
      'SELECT id, institution_id, hostname, mac_address FROM devices WHERE id = $1',
      [id],
    );

    if (devRes.rows.length === 0) {
      throw new NotFoundException('Dispositivo no encontrado');
    }

    const device = devRes.rows[0];
    if (institutionId && device.institution_id !== institutionId) {
      throw new BadRequestException('Aislamiento institucional: no se puede revocar un equipo de otra institución');
    }

    await this.databaseService.query(
      `UPDATE devices 
       SET is_revoked = true, status = $1, revocation_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [DeviceStatus.OFFLINE, reason, id],
    );

    await this.databaseService.query(
      `INSERT INTO audit_logs (id, institution_id, action, entity_type, entity_id, details_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        randomUUID(),
        device.institution_id,
        'DEVICE_REVOKED',
        'DEVICE',
        id,
        JSON.stringify({ actor: actorEmail, reason, hostname: device.hostname, mac: device.mac_address }),
      ],
    );

    return {
      success: true,
      deviceId: id,
      revoked: true,
      reason,
    };
  }
}
