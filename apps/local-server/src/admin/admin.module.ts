import { Module } from '@nestjs/common';
import { AdminController, HealthController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../database/database.module';
import { ServerIdentityModule } from '../identity/server-identity.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { GatewayModule } from '../gateway/gateway.module';
import { SfuModule } from '../sfu/sfu.module';

@Module({
  imports: [
    DatabaseModule,
    ServerIdentityModule,
    DiscoveryModule,
    GatewayModule,
    SfuModule,
  ],
  controllers: [AdminController, HealthController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
