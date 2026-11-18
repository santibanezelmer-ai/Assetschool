import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InstitutionsService, CreateInstitutionDto, UpdateInstitutionDto } from './institutions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/institutions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstitutionsController {
  constructor(private readonly service: InstitutionsService) {}

  @Get()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR)
  async list(@Request() req: any) {
    return this.service.findAll(req.user.role, req.user.institutionId);
  }

  @Get(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR)
  async getOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req.user.role, req.user.institutionId);
  }

  @Post()
  @Roles(SystemRole.SUPERADMIN)
  async create(@Body() body: CreateInstitutionDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateInstitutionDto,
    @Request() req: any,
  ) {
    return this.service.update(id, body, req.user.role, req.user.institutionId);
  }

  @Patch(':id/status')
  @Roles(SystemRole.SUPERADMIN)
  async setStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.service.setStatus(id, !!isActive);
  }
}
