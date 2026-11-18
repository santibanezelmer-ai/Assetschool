import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AgentGateway } from '../gateway/agent.gateway';
import { AgentRegistration } from '@assetschool/validators';
import { DeviceStatus } from '@assetschool/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    @Optional() private readonly gateway?: AgentGateway,
  ) {}

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

  /**
   * @param restrictToInstitutionId R0 / S4: when set (non-SUPERADMIN caller),
   * the device can only be registered in the caller's own institution.
   */
  async registerAgent(dto: AgentRegistration, restrictToInstitutionId?: string) {
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
    if (restrictToInstitutionId && institutionId !== restrictToInstitutionId) {
      throw new ForbiddenException('Aislamiento institucional: no puede registrar equipos en otra institución');
    }

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

    // Immediately terminate any active WebRTC screen streams if device is revoked
    if (this.gateway) {
      this.gateway.terminateDeviceStreams(id, `Dispositivo revocado por ${actorEmail}: ${reason}`);
    }

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

  async updateInventory(
    id: string,
    hardware: { deviceName?: string; processor?: string; ramMb?: number; storageGb?: number },
    institutionId?: string
  ) {
    await this.findOne(id, institutionId);

    const res = await this.databaseService.query(
      `UPDATE devices SET
        device_name = COALESCE($1, device_name),
        processor = COALESCE($2, processor),
        ram_mb = COALESCE($3, ram_mb),
        storage_gb = COALESCE($4, storage_gb),
        updated_at = NOW()
       WHERE id = $5
       RETURNING *;`,
      [
        hardware.deviceName ? hardware.deviceName.trim() : null,
        hardware.processor ? hardware.processor.trim() : null,
        hardware.ramMb || null,
        hardware.storageGb || null,
        id,
      ]
    );

    return res.rows[0];
  }

  async reassign(
    id: string,
    assignment: { classroomId?: string | null; studentId?: string | null },
    institutionId?: string
  ) {
    const device = await this.findOne(id, institutionId);

    // If assigning student, update student_device_history
    if (assignment.studentId !== undefined && assignment.studentId !== device.current_student_id) {
      if (device.current_student_id) {
        await this.databaseService.query(
          `UPDATE student_device_history SET unassigned_at = NOW() 
           WHERE device_id = $1 AND student_id = $2 AND unassigned_at IS NULL;`,
          [id, device.current_student_id]
        );
        await this.databaseService.query('UPDATE students SET assigned_device_id = NULL WHERE id = $1;', [device.current_student_id]);
      }

      if (assignment.studentId) {
        await this.databaseService.query('UPDATE students SET assigned_device_id = $1 WHERE id = $2;', [id, assignment.studentId]);
        await this.databaseService.query(
          `INSERT INTO student_device_history (institution_id, student_id, device_id, assigned_by, notes)
           VALUES ($1, $2, $3, $4, $5);`,
          [device.institution_id, assignment.studentId, id, 'Administrator', 'Reasignación de inventario']
        );
      }
    }

    const res = await this.databaseService.query(
      `UPDATE devices SET
        current_classroom_id = $1,
        current_student_id = $2,
        updated_at = NOW()
       WHERE id = $3
       RETURNING *;`,
      [
        assignment.classroomId !== undefined ? assignment.classroomId : device.current_classroom_id,
        assignment.studentId !== undefined ? assignment.studentId : device.current_student_id,
        id,
      ]
    );

    return res.rows[0];
  }

  async approveDevice(id: string, institutionId?: string) {
    await this.findOne(id, institutionId);
    const res = await this.databaseService.query(
      `UPDATE devices SET is_pending_approval = false, updated_at = NOW() WHERE id = $1 RETURNING *;`,
      [id]
    );
    return res.rows[0];
  }

  async reEnrollDevice(id: string, institutionId?: string) {
    await this.findOne(id, institutionId);
    const res = await this.databaseService.query(
      `UPDATE devices 
       SET is_revoked = false, revocation_reason = null, is_pending_approval = false, updated_at = NOW() 
       WHERE id = $1 RETURNING *;`,
      [id]
    );
    return res.rows[0];
  }

  // --------------------------------------------------------------------------
  // ENROLLMENT TOKENS
  // --------------------------------------------------------------------------
  async createEnrollmentToken(
    institutionId: string,
    options: { classroomId?: string; label?: string; maxUses?: number; expiresInHours?: number },
    createdBy: string
  ) {
    const token = 'ENROLL-' + randomUUID().substring(0, 8).toUpperCase() + '-' + randomUUID().substring(0, 8).toUpperCase();
    const hours = options.expiresInHours || 24;
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

    const res = await this.databaseService.query(
      `INSERT INTO enrollment_tokens (
        institution_id, classroom_id, token, label, max_uses, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;`,
      [
        institutionId,
        options.classroomId || null,
        token,
        options.label || 'Token de Enrolamiento Masivo',
        options.maxUses || 50,
        expiresAt,
        createdBy,
      ]
    );

    return res.rows[0];
  }

  async listEnrollmentTokens(institutionId?: string) {
    let sql = `SELECT * FROM enrollment_tokens WHERE 1=1`;
    const params: any[] = [];
    if (institutionId) {
      params.push(institutionId);
      sql += ` AND institution_id = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC;';
    const res = await this.databaseService.query(sql, params);
    return res.rows;
  }

  async revokeEnrollmentToken(tokenId: string, institutionId?: string) {
    let sql = 'UPDATE enrollment_tokens SET is_revoked = true WHERE id = $1';
    const params: any[] = [tokenId];
    if (institutionId) {
      params.push(institutionId);
      sql += ' AND institution_id = $2';
    }
    sql += ' RETURNING *;';
    const res = await this.databaseService.query(sql, params);
    if (res.rows.length === 0) throw new NotFoundException('Token no encontrado');
    return res.rows[0];
  }

  async enrollWithToken(tokenStr: string, agentData: {
    hostname: string;
    macAddress: string;
    localIp: string;
    osType: string;
    osVersion: string;
    architecture: string;
    processor?: string;
    ramMb?: number;
    storageGb?: number;
  }) {
    const tokenRes = await this.databaseService.query(
      `SELECT * FROM enrollment_tokens WHERE token = $1;`,
      [tokenStr.trim()]
    );

    if (tokenRes.rows.length === 0) {
      throw new BadRequestException('Token de enrolamiento inválido');
    }

    const t = tokenRes.rows[0];
    if (t.is_revoked) {
      throw new BadRequestException('El token de enrolamiento ha sido revocado');
    }

    if (new Date(t.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('El token de enrolamiento ha expirado');
    }

    if (t.uses_count >= t.max_uses) {
      throw new BadRequestException('El token de enrolamiento ha alcanzado el límite máximo de usos');
    }

    // Check if device already exists
    const devRes = await this.databaseService.query(
      `SELECT * FROM devices WHERE institution_id = $1 AND LOWER(mac_address) = LOWER($2);`,
      [t.institution_id, agentData.macAddress]
    );

    let deviceId: string;
    if (devRes.rows.length > 0) {
      deviceId = devRes.rows[0].id;
      await this.databaseService.query(
        `UPDATE devices SET
          hostname = $1, local_ip = $2, os_type = $3, os_version = $4, architecture = $5,
          current_classroom_id = COALESCE($6, current_classroom_id),
          processor = COALESCE($7, processor),
          ram_mb = COALESCE($8, ram_mb),
          storage_gb = COALESCE($9, storage_gb),
          is_revoked = false, revocation_reason = null, is_pending_approval = false,
          updated_at = NOW()
         WHERE id = $10;`,
        [
          agentData.hostname,
          agentData.localIp,
          agentData.osType,
          agentData.osVersion,
          agentData.architecture,
          t.classroom_id,
          agentData.processor || null,
          agentData.ramMb || null,
          agentData.storageGb || null,
          deviceId,
        ]
      );
    } else {
      deviceId = randomUUID();
      await this.databaseService.query(
        `INSERT INTO devices (
          id, institution_id, hostname, mac_address, local_ip, os_type, os_version,
          architecture, current_classroom_id, processor, ram_mb, storage_gb,
          status, enrolled_at, is_revoked, is_pending_approval, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'online', NOW(), false, false, NOW(), NOW());`,
        [
          deviceId,
          t.institution_id,
          agentData.hostname,
          agentData.macAddress,
          agentData.localIp,
          agentData.osType,
          agentData.osVersion,
          agentData.architecture,
          t.classroom_id,
          agentData.processor || null,
          agentData.ramMb || null,
          agentData.storageGb || null,
        ]
      );
    }

    // Increment token uses count
    await this.databaseService.query(
      `UPDATE enrollment_tokens SET uses_count = uses_count + 1 WHERE id = $1;`,
      [t.id]
    );

    return {
      success: true,
      deviceId,
      institutionId: t.institution_id,
      classroomId: t.classroom_id,
      message: 'Dispositivo enrolado exitosamente mediante token institucional',
    };
  }
}
