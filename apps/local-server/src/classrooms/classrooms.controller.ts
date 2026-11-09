import { Controller, Get, Post, Param, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { ClassroomsService } from './classrooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';
import { CreateClassroomSchema, CreateClassroom } from '@assetschool/validators';

@Controller('api/v1/classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getClassrooms(@Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.findAll(institutionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getClassroom(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.findOne(id, institutionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  @Post()
  async createClassroom(@Body() body: CreateClassroom, @Request() req: any) {
    if (req.user?.role !== SystemRole.SUPERADMIN && body.institutionId && body.institutionId !== req.user?.institutionId) {
      throw new BadRequestException('Aislamiento institucional: no puede crear salas en otra institución');
    }
    const validated = CreateClassroomSchema.parse(body);
    return this.classroomsService.create(validated);
  }
}
