import { Module } from '@nestjs/common';
import { TallyController, TallyIngestController } from './tally.controller';
import { TallyIngestService } from './tally.ingest.service';
import { TallyQueryService } from './tally.query.service';

@Module({
  controllers: [TallyIngestController, TallyController],
  providers: [TallyIngestService, TallyQueryService],
})
export class TallyModule {}
