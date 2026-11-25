import { Public, Roles } from '../../auth/auth.util';
import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/admin-key.guard';
import { addDays, dateRange, istToday, isIsoDate } from '../../common/ist-date';
import { FunsquareQueryService } from './funsquare.query.service';
import { FunsquareSyncService } from './funsquare.sync.service';

const MAX_SYNC_DAYS = 62;

@Controller('funsquare')
export class FunsquareController {
  constructor(
    private readonly sync: FunsquareSyncService,
    private readonly query: FunsquareQueryService,
  ) {}

  /** GET /api/funsquare/summary?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: last 7 days incl. today). */
  @Get('summary')
  @Roles('viewer')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    const end = isIsoDate(to) ? to : istToday();
    const start = isIsoDate(from) ? from : addDays(end, -6);
    if (start > end) throw new BadRequestException('from must be before to');
    return this.query.summary(start, end);
  }

  /** POST /api/funsquare/sync { from, to }  (header x-admin-key) - manual sync / backfill. */
  @Post('sync')
  @Public()
  @UseGuards(AdminKeyGuard)
  async run(@Body() body: { from?: string; to?: string }) {
    const to = isIsoDate(body?.to) ? body.to : istToday();
    const from = isIsoDate(body?.from) ? body.from : to;
    if (from > to) throw new BadRequestException('from must be before to');
    if (dateRange(from, to).length > MAX_SYNC_DAYS) {
      throw new BadRequestException(`Max ${MAX_SYNC_DAYS} days per request`);
    }
    const days = await this.sync.syncRange(from, to, 'manual');
    return { from, to, days };
  }
}
