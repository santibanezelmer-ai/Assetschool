import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';
import { AgentRegistrationSchema, AgentRegistration } from '@assetschool/validators';

@Controller('api/v1/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getDevices(
    @Request() req: any,
    @Query('classroomId') classroomId?: string,
    @Query('includeDemo') includeDemo?: string,
  ) {
    const withDemo = includeDemo !== 'false';
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.findAll(classroomId, withDemo, institutionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getDevice(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.findOne(id, institutionId);
  }

  // R0 / S4: registering a device is an administrative action. It used to be
  // unauthenticated, which let anyone on the LAN (the institution code is in the
  // UDP beacon) register a device and bypass agent quarantine.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post('register')
  async register(@Body() body: AgentRegistration, @Request() req: any) {
    const validated = AgentRegistrationSchema.parse(body);
    const restrictTo = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.registerAgent(validated, restrictTo);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post(':id/revoke')
  async revoke(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.revokeDevice(id, reason || 'Revocado por administrador', req.user?.email, institutionId);
  }
}
