import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { CommandsService } from './commands.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@assetschool/shared-types';
import { DispatchCommandSchema, DispatchCommand } from '@assetschool/validators';

@Controller('api/v1/commands')
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPERADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER)
  @Post('dispatch')
  async dispatch(@Body() body: DispatchCommand, @Request() req: any) {
    const validated = DispatchCommandSchema.parse(body);
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.commandsService.dispatch(validated, req.user.userId, req.user.email, institutionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('recent')
  async getRecent(@Request() req: any) {
    const institutionId = req.user?.role === SystemRole.SUPERADMIN ? undefined : req.user?.institutionId;
    return this.commandsService.listRecent(institutionId);
  }
}
