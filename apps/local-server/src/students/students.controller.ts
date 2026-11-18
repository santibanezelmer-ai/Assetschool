import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { StudentsService, CreateStudentDto, UpdateStudentDto } from './students.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';

@Controller('api/v1/students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER)
  async list(
    @Request() req: any,
    @Query('institutionId') institutionId?: string,
    @Query('courseId') courseId?: string,
    @Query('search') search?: string,
  ) {
    return this.studentsService.findAll(req.user.role, req.user.institutionId, institutionId, courseId, search);
  }

  @Get(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER)
  async getOne(@Param('id') id: string, @Request() req: any) {
    return this.studentsService.findOne(id, req.user.role, req.user.institutionId);
  }

  @Post()
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async create(@Body() body: CreateStudentDto, @Request() req: any) {
    const institutionId = req.user.role === SystemRole.SUPERADMIN ? body.institutionId : req.user.institutionId;
    return this.studentsService.create({ ...body, institutionId }, req.user.role, req.user.institutionId);
  }

  @Put(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateStudentDto,
    @Request() req: any,
  ) {
    return this.studentsService.update(id, body, req.user.role, req.user.institutionId);
  }

  @Delete(':id')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.studentsService.delete(id, req.user.role, req.user.institutionId);
  }

  @Post(':id/assign-device')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER)
  async assignDevice(
    @Param('id') id: string,
    @Body('deviceId') deviceId: string,
    @Body('notes') notes: string,
    @Request() req: any,
  ) {
    return this.studentsService.assignDevice(id, deviceId, notes, req.user.role, req.user.institutionId);
  }

  @Post(':id/unassign-device')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER)
  async unassignDevice(@Param('id') id: string, @Request() req: any) {
    return this.studentsService.unassignDevice(id, req.user.role, req.user.institutionId);
  }

  @Post('import-csv')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN)
  async importCsv(
    @Body('csvContent') csvContent: string,
    @Body('institutionId') institutionId: string,
    @Request() req: any,
  ) {
    const targetInstId = req.user.role === SystemRole.SUPERADMIN ? institutionId : req.user.institutionId;
    return this.studentsService.importCsv(targetInstId, csvContent, req.user.role, req.user.institutionId);
  }

  @Get('export/csv')
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.DIRECTOR, SystemRole.TEACHER)
  async exportCsv(
    @Query('institutionId') institutionId: string,
    @Query('courseId') courseId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const targetInstId = req.user.role === SystemRole.SUPERADMIN ? institutionId : req.user.institutionId;
    const csv = await this.studentsService.exportCsv(targetInstId, courseId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
    res.send(csv);
  }
}
