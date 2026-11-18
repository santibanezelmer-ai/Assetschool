import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR)
  async list(@Request() req: any, @Query('institutionId') institutionId?: string) {
    return this.usersService.findAll(req.user.role, req.user.institutionId, institutionId);
  }

  @Get(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER)
  async getOne(@Param('id') id: string, @Request() req: any) {
    return this.usersService.findOne(id, req.user.role, req.user.institutionId);
  }

  @Post()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async create(@Body() body: CreateUserDto, @Request() req: any) {
    const institutionId = req.user.role === SystemRole.SUPERADMIN ? body.institutionId : req.user.institutionId;
    return this.usersService.create({ ...body, institutionId }, req.user.role, req.user.institutionId);
  }

  @Put(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.usersService.update(id, body, req.user.role, req.user.institutionId);
  }

  @Patch(':id/status')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async setStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @Request() req: any,
  ) {
    return this.usersService.setStatus(id, !!isActive, req.user.role, req.user.institutionId);
  }

  @Post(':id/reset-password')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
    @Request() req: any,
  ) {
    return this.usersService.resetPassword(id, newPassword, req.user.role, req.user.institutionId);
  }

  @Post(':id/assign-classrooms')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async assignClassrooms(
    @Param('id') id: string,
    @Body('classroomIds') classroomIds: string[],
    @Request() req: any,
  ) {
    return this.usersService.assignClassrooms(id, classroomIds || [], req.user.role, req.user.institutionId);
  }

  @Post(':id/assign-courses')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async assignCourses(
    @Param('id') id: string,
    @Body('courses') courses: { courseId: string; isLeadTeacher?: boolean }[],
    @Request() req: any,
  ) {
    return this.usersService.assignCourses(id, courses || [], req.user.role, req.user.institutionId);
  }
}
