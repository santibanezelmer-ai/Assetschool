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
    @Query('classroomId') classroomId?: string,
    @Query('includeDemo') includeDemo?: string,
  ) {
    const withDemo = includeDemo !== 'false';
    return this.devicesService.findAll(classroomId, withDemo);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getDevice(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Post('register')
  async register(@Body() body: AgentRegistration) {
    const validated = AgentRegistrationSchema.parse(body);
    return this.devicesService.registerAgent(validated);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post(':id/revoke')
  async revoke(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.devicesService.revokeDevice(id, reason || 'Revocado por administrador', req.user.email);
  }
}
