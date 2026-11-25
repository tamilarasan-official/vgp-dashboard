import { Public, Roles } from '../../auth/auth.util';
import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/admin-key.guard';
import { addDays, dateRange, istToday, isIsoDate } from '../../common/ist-date';
import { GreythrQueryService, HR_GROUPS } from './greythr.query.service';
import { GreythrSyncService } from './greythr.sync.service';

@Controller('greythr')
export class GreythrController {
  constructor(
    private readonly sync: GreythrSyncService,
    private readonly query: GreythrQueryService,
  ) {}

  /** GET /api/greythr/summary?from&to&group=ALL|WW|IR|FLY|VEL|COMMON (default: last 7 days up to yesterday). */
  @Get('summary')
  @Roles('viewer')
  summary(@Query('from') from?: string, @Query('to') to?: string, @Query('group') group?: string) {
    const end = isIsoDate(to) ? to : addDays(istToday(), -1);
    const start = isIsoDate(from) ? from : addDays(end, -6);
    if (start > end) throw new BadRequestException('from must be before to');
    const g = group && (HR_GROUPS as readonly string[]).includes(group) ? group : 'ALL';
    return this.query.summary(start, end, g);
  }

  /** POST /api/greythr/sync { from, to } (header x-admin-key) - max 92 days per request. */
  @Post('sync')
  @Public()
  @UseGuards(AdminKeyGuard)
  run(@Body() body: { from?: string; to?: string }) {
    const to = isIsoDate(body?.to) ? body.to : istToday();
    const from = isIsoDate(body?.from) ? body.from : addDays(to, -1);
    if (from > to) throw new BadRequestException('from must be before to');
    if (dateRange(from, to).length > 92) throw new BadRequestException('Max 92 days per request');
    return this.sync.sync(from, to, 'manual');
  }
}
