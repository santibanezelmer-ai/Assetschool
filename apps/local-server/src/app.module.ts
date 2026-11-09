import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DevicesModule } from './devices/devices.module';
import { ClassroomsModule } from './classrooms/classrooms.module';
import { CommandsModule } from './commands/commands.module';
import { AuditModule } from './audit/audit.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    DashboardModule,
    DevicesModule,
    ClassroomsModule,
    CommandsModule,
    AuditModule,
    GatewayModule,
  ],
})
export class AppModule {}
