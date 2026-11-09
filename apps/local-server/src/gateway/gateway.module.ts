import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class GatewayModule {}
