import { Module } from '@nestjs/common';
import { SyncModule } from '../../sync/sync.module';
import { GreythrClient } from './greythr.client';
import { GreythrController } from './greythr.controller';
import { GreythrQueryService } from './greythr.query.service';
import { GreythrSyncService } from './greythr.sync.service';

@Module({
  imports: [SyncModule],
  controllers: [GreythrController],
  providers: [GreythrClient, GreythrSyncService, GreythrQueryService],
})
export class GreythrModule {}
