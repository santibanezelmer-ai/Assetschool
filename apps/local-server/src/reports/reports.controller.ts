import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TECH_SUPPORT)
  async getSummary(@Request() req: any, @Query('institutionId') queryInstitutionId?: string) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? queryInstitutionId : req.user?.institutionId;
    return this.reportsService.getExecutiveSummary(institutionId);
  }

  @Get('classrooms-occupancy')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER, SystemRole.TECH_SUPPORT)
  async getClassroomsOccupancy(@Request() req: any, @Query('institutionId') queryInstitutionId?: string) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? queryInstitutionId : req.user?.institutionId;
    return this.reportsService.getClassroomsOccupancy(institutionId);
  }

  @Get('inventory-hardware')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TECH_SUPPORT)
  async getInventoryHardware(@Request() req: any, @Query('institutionId') queryInstitutionId?: string) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? queryInstitutionId : req.user?.institutionId;
    return this.reportsService.getInventoryHardwareReport(institutionId);
  }
}
