import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DevicesModule } from './devices/devices.module';
import { ClassroomsModule } from './classrooms/classrooms.module';
import { CommandsModule } from './commands/commands.module';
import { AuditModule } from './audit/audit.module';
import { GatewayModule } from './gateway/gateway.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { SfuModule } from './sfu/sfu.module';
import { ServerIdentityModule } from './identity/server-identity.module';
import { AdminModule } from './admin/admin.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { StudentsModule } from './students/students.module';
import { ReportsModule } from './reports/reports.module';
import { LicensingModule } from './licensing/licensing.module';

@Module({
  imports: [
    DatabaseModule,
    ServerIdentityModule,
    AuthModule,
    DashboardModule,
    InstitutionsModule,
    UsersModule,
    CoursesModule,
    StudentsModule,
    ClassroomsModule,
    DevicesModule,
    CommandsModule,
    AuditModule,
    ReportsModule,
    GatewayModule,
    DiscoveryModule,
    SfuModule,
    AdminModule,
    LicensingModule,
  ],
})
export class AppModule {}
