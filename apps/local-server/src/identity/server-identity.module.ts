import { Module, Global } from '@nestjs/common';
import { ServerIdentityService } from './server-identity.service';

@Global()
@Module({
  providers: [ServerIdentityService],
  exports: [ServerIdentityService],
})
export class ServerIdentityModule {}
