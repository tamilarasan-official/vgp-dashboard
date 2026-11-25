import { Module } from '@nestjs/common';
import { SyncRunService } from './sync-run.service';

@Module({
  providers: [SyncRunService],
  exports: [SyncRunService],
})
export class SyncModule {}
