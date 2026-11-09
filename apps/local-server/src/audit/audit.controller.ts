import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Get()
  async getAuditLogs() {
    return this.auditService.findAll();
  }
}
