import { Module } from '@nestjs/common';
import { SyncModule } from '../../sync/sync.module';
import { ZohoClient } from './zoho.client';
import { ZohoController } from './zoho.controller';
import { ZohoQueryService } from './zoho.query.service';
import { ZohoSyncService } from './zoho.sync.service';

@Module({
  imports: [SyncModule],
  controllers: [ZohoController],
  providers: [ZohoClient, ZohoSyncService, ZohoQueryService],
})
export class ZohoModule {}
