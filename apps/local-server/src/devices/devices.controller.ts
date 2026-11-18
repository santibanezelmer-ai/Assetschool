import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
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

  // Enrollment token endpoints MUST be defined before ':id' routes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post('enrollment/tokens')
  async createEnrollmentToken(
    @Body() body: { classroomId?: string; label?: string; maxUses?: number; expiresInHours?: number; institutionId?: string },
    @Request() req: any,
  ) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? body.institutionId : req.user?.institutionId;
    if (!institutionId) throw new BadRequestException('ID institucional requerido');
    return this.devicesService.createEnrollmentToken(institutionId, body, req.user?.email || 'admin');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Get('enrollment/tokens')
  async listEnrollmentTokens(@Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.listEnrollmentTokens(institutionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post('enrollment/tokens/:tokenId/revoke')
  async revokeEnrollmentToken(@Param('tokenId') tokenId: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.revokeEnrollmentToken(tokenId, institutionId);
  }

  // Unauthenticated/Token-based enrollment claim endpoint for agents
  @Post('enrollment/claim')
  async claimEnrollment(@Body() body: { token: string; agent: any }) {
    if (!body?.token || !body?.agent?.macAddress) {
      throw new BadRequestException("Se requiere 'token' y datos del 'agent' con 'macAddress'");
    }
    return this.devicesService.enrollWithToken(body.token, body.agent);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getDevice(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.findOne(id, institutionId);
  }

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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Put(':id/inventory')
  async updateInventory(
    @Param('id') id: string,
    @Body() body: { deviceName?: string; processor?: string; ramMb?: number; storageGb?: number },
    @Request() req: any,
  ) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.updateInventory(id, body, institutionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Put(':id/reassign')
  async reassign(
    @Param('id') id: string,
    @Body() body: { classroomId?: string | null; studentId?: string | null },
    @Request() req: any,
  ) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.reassign(id, body, institutionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.approveDevice(id, institutionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TECH_SUPPORT)
  @Post(':id/re-enroll')
  async reEnroll(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.devicesService.reEnrollDevice(id, institutionId);
  }
}
