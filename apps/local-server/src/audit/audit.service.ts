import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll() {
    const store = this.databaseService.getStore();
    return store.auditLogs;
  }
}
