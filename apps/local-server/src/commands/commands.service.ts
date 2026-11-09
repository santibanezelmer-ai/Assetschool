import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DispatchCommand } from '@assetschool/validators';
import { CommandStatus, DeviceStatus } from '@assetschool/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class CommandsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async dispatch(dto: DispatchCommand, issuerUserId: string, issuerEmail: string) {
    const store = this.databaseService.getStore();
    const createdCommands: any[] = [];

    for (const deviceId of dto.deviceIds) {
      const device = store.devices.find((d) => d.id === deviceId);
      if (!device) {
        throw new BadRequestException(`Dispositivo con id ${deviceId} no existe`);
      }

      if (device.isRevoked) {
        throw new BadRequestException(`El dispositivo ${device.hostname} está revocado.`);
      }

      const commandRecord = {
        id: randomUUID(),
        classroomSessionId: dto.classroomSessionId,
        deviceId: device.id,
        issuerUserId,
        commandType: dto.commandType,
        payloadJson: dto.params,
        status: CommandStatus.ACKNOWLEDGED,
        issuedAt: new Date().toISOString(),
      };

      // Apply simulated state change for demo devices if screen locked / unlocked
      if (dto.commandType === 'LOCK_SCREEN') {
        device.status = DeviceStatus.LOCKED;
      } else if (dto.commandType === 'UNLOCK_SCREEN') {
        device.status = DeviceStatus.ONLINE;
      }

      store.commands.push(commandRecord);
      createdCommands.push(commandRecord);
    }

    store.auditLogs.unshift({
      id: randomUUID(),
      institutionId: store.institutions[0].id,
      timestamp: new Date().toISOString(),
      action: `COMMAND_${dto.commandType}`,
      actor: issuerEmail,
      details: `Comando ${dto.commandType} emitido a ${dto.deviceIds.length} estación(es)`,
      severity: 'info',
    });

    return {
      success: true,
      dispatchedCount: createdCommands.length,
      commands: createdCommands,
    };
  }

  async listRecent() {
    const store = this.databaseService.getStore();
    return store.commands.slice(-50).reverse();
  }
}
