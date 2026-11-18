import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { LicensingService } from './licensing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/license')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    SystemRole.SUPERADMIN,
    SystemRole.INSTITUTION_ADMIN,
    SystemRole.DIRECTOR,
    SystemRole.TEACHER,
    SystemRole.TECH_SUPPORT,
  )
  @Get('status')
  async getStatus(@Request() req: any) {
    const isSuperAdmin = req.user?.role === SystemRole.SUPERADMIN;
    const institutionId = isSuperAdmin ? undefined : req.user?.institutionId;
    return this.licensingService.getLicenseStatus(institutionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  @Post('activate')
  async activateLicense(@Body() body: any) {
    return this.licensingService.activate(body.license || body);
  }
}
