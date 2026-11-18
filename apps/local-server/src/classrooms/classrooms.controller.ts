import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ClassroomsService, CreateClassroomInput, UpdateClassroomInput } from './classrooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/classrooms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @Get()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER, SystemRole.TECH_SUPPORT)
  async getClassrooms(@Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.findAll(institutionId);
  }

  @Get(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER, SystemRole.TECH_SUPPORT)
  async getClassroom(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.findOne(id, institutionId);
  }

  @Post()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async createClassroom(@Body() body: CreateClassroomInput, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? body.institutionId : req.user?.institutionId;
    if (!institutionId) {
      throw new BadRequestException('ID institucional requerido');
    }
    return this.classroomsService.create({ ...body, institutionId });
  }

  @Put(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async updateClassroom(
    @Param('id') id: string,
    @Body() body: UpdateClassroomInput,
    @Request() req: any,
  ) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.update(id, body, institutionId);
  }

  @Delete(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async deleteClassroom(@Param('id') id: string, @Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.delete(id, institutionId);
  }

  @Post(':id/assign-teachers')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async assignTeachers(
    @Param('id') id: string,
    @Body('userIds') userIds: string[],
    @Request() req: any,
  ) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.classroomsService.assignTeachers(id, userIds || [], institutionId);
  }
}
