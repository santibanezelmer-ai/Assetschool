import { Module } from '@nestjs/common';
import { DiscoveryBeaconService } from './discovery-beacon.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [DiscoveryBeaconService],
  exports: [DiscoveryBeaconService],
})
export class DiscoveryModule {}
