import { Module } from '@nestjs/common';
import { SyncModule } from '../../sync/sync.module';
import { FunsquareClient } from './funsquare.client';
import { FunsquareController } from './funsquare.controller';
import { FunsquareQueryService } from './funsquare.query.service';
import { FunsquareSyncService } from './funsquare.sync.service';

@Module({
  imports: [SyncModule],
  controllers: [FunsquareController],
  providers: [FunsquareClient, FunsquareSyncService, FunsquareQueryService],
})
export class FunsquareModule {}
