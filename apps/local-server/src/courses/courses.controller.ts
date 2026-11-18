import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CoursesService, CreateCourseDto, UpdateCourseDto } from './courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER)
  async list(
    @Request() req: any,
    @Query('institutionId') institutionId?: string,
    @Query('year') year?: string,
  ) {
    const yr = year ? parseInt(year, 10) : undefined;
    return this.coursesService.findAll(req.user.role, req.user.institutionId, institutionId, yr);
  }

  @Get(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER)
  async getOne(@Param('id') id: string, @Request() req: any) {
    return this.coursesService.findOne(id, req.user.role, req.user.institutionId);
  }

  @Post()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async create(@Body() body: CreateCourseDto, @Request() req: any) {
    const institutionId = req.user.role === SystemRole.SUPERADMIN ? body.institutionId : req.user.institutionId;
    return this.coursesService.create({ ...body, institutionId }, req.user.role, req.user.institutionId);
  }

  @Put(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCourseDto,
    @Request() req: any,
  ) {
    return this.coursesService.update(id, body, req.user.role, req.user.institutionId);
  }

  @Delete(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.coursesService.delete(id, req.user.role, req.user.institutionId);
  }
}
