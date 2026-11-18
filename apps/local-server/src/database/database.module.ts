import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { BackupManagerService } from './backup-manager.service';

@Global()
@Module({
  providers: [DatabaseService, BackupManagerService],
  exports: [DatabaseService, BackupManagerService],
})
export class DatabaseModule {}
