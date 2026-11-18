import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AuthModule } from '../auth/auth.module';
import { SfuModule } from '../sfu/sfu.module';

@Module({
  imports: [AuthModule, SfuModule],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class GatewayModule {}
