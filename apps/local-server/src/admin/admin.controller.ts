import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';
import { ServerOperatingMode } from '../identity/server-identity.service';

@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async getStatus() {
    return this.adminService.getServerStatus();
  }

  @Get('connections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async getConnections() {
    return this.adminService.getConnectionsList();
  }

  @Get('classrooms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER)
  async getClassrooms() {
    return this.adminService.getClassroomsSummary();
  }

  @Get('backups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async getBackups() {
    return this.adminService.getBackupsList();
  }

  @Post('backup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async triggerBackup(@Body() body: { label?: string }) {
    return this.adminService.createBackup(body?.label);
  }

  @Post('export-bundle')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async exportMigrationBundle() {
    return this.adminService.exportMigrationBundle();
  }

  @Post('import-bundle')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async importMigrationBundle(@Body() body: { packageJson: string }) {
    return this.adminService.importMigrationBundle(body.packageJson);
  }

  @Post('mode')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async setMode(@Body() body: { mode: ServerOperatingMode }) {
    return this.adminService.setServerMode(body.mode);
  }
}

@Controller()
export class HealthController {
  constructor(private readonly adminService: AdminService) {}

  @Get('health')
  async getHealthRoot() {
    return this.getHealth();
  }

  @Get('api/v1/health')
  async getHealth() {
    const status = await this.adminService.getServerStatus();
    return {
      status: status.database.connected ? 'ok' : 'degraded',
      serverId: status.serverId,
      serverMode: status.serverMode,
      uptimeSeconds: status.uptimeSeconds,
      timestamp: new Date().toISOString(),
      connections: status.connections,
    };
  }
}
