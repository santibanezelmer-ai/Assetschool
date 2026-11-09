import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
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
  async getClassrooms() {
    return this.classroomsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getClassroom(@Param('id') id: string) {
    return this.classroomsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  @Post()
  async createClassroom(@Body() body: CreateClassroom) {
    const validated = CreateClassroomSchema.parse(body);
    return this.classroomsService.create(validated);
  }
}
