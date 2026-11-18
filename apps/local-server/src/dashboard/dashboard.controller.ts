import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Roles(
    SystemRole.SUPERADMIN,
    SystemRole.INSTITUTION_ADMIN,
    SystemRole.DIRECTOR,
    SystemRole.TEACHER,
    SystemRole.TECH_SUPPORT,
  )
  async getStats(
    @Request() req: any,
    @Query('institutionId') queryInstitutionId?: string,
  ) {
    const isSuperAdmin = req.user?.role === SystemRole.SUPERADMIN;
    let targetInstitutionId: string | undefined;

    if (isSuperAdmin) {
      targetInstitutionId = queryInstitutionId || undefined;
    } else {
      if (!req.user?.institutionId) {
        throw new ForbiddenException('Institución no identificada en la sesión del usuario');
      }
      if (queryInstitutionId && queryInstitutionId !== req.user.institutionId) {
        throw new ForbiddenException('Acceso interinstitucional denegado: no autorizado para consultar estadísticas de otra institución');
      }
      targetInstitutionId = req.user.institutionId;
    }

    return this.dashboardService.getStats(targetInstitutionId);
  }

  @Get('overview')
  @Roles(
    SystemRole.SUPERADMIN,
    SystemRole.INSTITUTION_ADMIN,
    SystemRole.DIRECTOR,
    SystemRole.TEACHER,
    SystemRole.TECH_SUPPORT,
  )
  async getOverview(
    @Request() req: any,
    @Query('institutionId') queryInstitutionId?: string,
  ) {
    const isSuperAdmin = req.user?.role === SystemRole.SUPERADMIN;
    let targetInstitutionId: string | undefined;

    if (isSuperAdmin) {
      targetInstitutionId = queryInstitutionId || undefined;
    } else {
      if (!req.user?.institutionId) {
        throw new ForbiddenException('Institución no identificada en la sesión del usuario');
      }
      if (queryInstitutionId && queryInstitutionId !== req.user.institutionId) {
        throw new ForbiddenException('Acceso interinstitucional denegado: no autorizado para consultar información de otra institución');
      }
      targetInstitutionId = req.user.institutionId;
    }

    return this.dashboardService.getOverview(targetInstitutionId);
  }
}

