import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateClassroom } from '@assetschool/validators';
import { randomUUID } from 'crypto';

@Injectable()
export class ClassroomsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll() {
    const store = this.databaseService.getStore();
    return store.classrooms;
  }

  async findOne(id: string) {
    const store = this.databaseService.getStore();
    const classroom = store.classrooms.find((c) => c.id === id);
    if (!classroom) {
      throw new NotFoundException(`Sala con id ${id} no encontrada`);
    }
    return classroom;
  }

  async create(dto: CreateClassroom) {
    const store = this.databaseService.getStore();
    const newClassroom = {
      id: randomUUID(),
      institutionId: dto.institutionId,
      name: dto.name,
      code: dto.code,
      capacity: dto.capacity,
      subnetLan: dto.subnetLan || '192.168.1.0/24',
      broadcastIp: dto.broadcastIp || '192.168.1.255',
      isOnline: false,
    };
    store.classrooms.push(newClassroom);
    return newClassroom;
  }
}
