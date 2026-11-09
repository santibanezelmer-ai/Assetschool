import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AgentRegistration } from '@assetschool/validators';
import { DeviceStatus } from '@assetschool/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class DevicesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(classroomId?: string, includeDemo: boolean = true) {
    const store = this.databaseService.getStore();
    return store.devices.filter((d) => {
      if (!includeDemo && d.isDemo) return false;
      if (classroomId && d.currentClassroomId !== classroomId) return false;
      return true;
    });
  }

  async findOne(id: string) {
    const store = this.databaseService.getStore();
    const device = store.devices.find((d) => d.id === id);
    if (!device) {
      throw new NotFoundException(`Dispositivo con id ${id} no encontrado`);
    }
    return device;
  }

  async registerAgent(dto: AgentRegistration) {
    const store = this.databaseService.getStore();
    const existing = store.devices.find((d) => d.macAddress.toLowerCase() === dto.macAddress.toLowerCase());

    if (existing) {
      if (existing.isRevoked) {
        throw new BadRequestException('Dispositivo revocado por el administrador de red. Contacte a soporte TIC.');
      }
      existing.localIp = dto.localIp;
      existing.hostname = dto.hostname;
      existing.osVersion = dto.osVersion;
      existing.status = DeviceStatus.ONLINE;
      existing.lastHeartbeatAt = new Date().toISOString();
      return {
        isEnrolled: true,
        deviceId: existing.id,
        message: 'Dispositivo re-conectado exitosamente',
      };
    }

    const newDevice = {
      id: randomUUID(),
      institutionId: store.institutions[0].id,
      hostname: dto.hostname,
      macAddress: dto.macAddress,
      localIp: dto.localIp,
      osType: dto.osType,
      osVersion: dto.osVersion,
      architecture: dto.architecture,
      status: DeviceStatus.ONLINE,
      enrolledAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      isRevoked: false,
      isDemo: false, // Truly enrolled hardware
      currentClassroomId: undefined,
      studentName: undefined,
      revocationReason: undefined,
    };

    store.devices.push(newDevice);

    store.auditLogs.unshift({
      id: randomUUID(),
      institutionId: store.institutions[0].id,
      timestamp: new Date().toISOString(),
      action: 'DEVICE_ENROLLED',
      actor: dto.hostname,
      details: `Dispositivo ${dto.hostname} (${dto.osType}) enrolado con IP ${dto.localIp}`,
      severity: 'info',
    });

    return {
      isEnrolled: true,
      deviceId: newDevice.id,
      message: 'Dispositivo enrolado por primera vez en la red institucional',
    };
  }

  async revokeDevice(id: string, reason: string, actorEmail: string) {
    const store = this.databaseService.getStore();
    const device = store.devices.find((d) => d.id === id);
    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }

    device.isRevoked = true;
    device.status = DeviceStatus.OFFLINE;
    device.revocationReason = reason;

    store.auditLogs.unshift({
      id: randomUUID(),
      institutionId: device.institutionId,
      timestamp: new Date().toISOString(),
      action: 'DEVICE_REVOKED',
      actor: actorEmail,
      details: `Dispositivo ${device.hostname} (${device.macAddress}) revocado: ${reason}`,
      severity: 'warning',
    });

    return {
      success: true,
      deviceId: id,
      revoked: true,
      reason,
    };
  }
}
