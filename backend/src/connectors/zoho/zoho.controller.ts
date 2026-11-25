import { Public, Roles } from '../../auth/auth.util';
import { BadRequestException, Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/admin-key.guard';
import { addDays, istToday, isIsoDate } from '../../common/ist-date';
import { vgpLine } from './zoho.sync.service';
import { ZOHO_PROPERTIES, ZohoQueryService } from './zoho.query.service';
import { ZohoSyncService } from './zoho.sync.service';

@Controller('zoho')
export class ZohoController {
  constructor(
    private readonly sync: ZohoSyncService,
    private readonly query: ZohoQueryService,
  ) {}

  /** GET /api/zoho/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&property=ALL|WW|IR|FLY|UNASSIGNED (default last 7 days). */
  @Get('summary')
  @Roles('viewer')
  summary(@Query('from') from?: string, @Query('to') to?: string, @Query('property') property?: string) {
    const end = isIsoDate(to) ? to : istToday();
    const start = isIsoDate(from) ? from : addDays(end, -6);
    if (start > end) throw new BadRequestException('from must be before to');
    const p = property && (ZOHO_PROPERTIES as readonly string[]).includes(property) ? property : 'ALL';
    return this.query.summary(start, end, p);
  }

  /** POST /api/zoho/sync { full?: boolean } (header x-admin-key). */
  @Post('sync')
  @Public()
  @UseGuards(AdminKeyGuard)
  run(@Body() body: { full?: boolean }) {
    return this.sync.sync(body?.full ? 'full' : 'manual');
  }

  /** GET /api/zoho/lines - VGP phone line -> property mapping. */
  @Get('lines')
  @Roles('viewer')
  lines() {
    return this.query.lines();
  }

  /** PUT /api/zoho/lines [{ number, propertyCode: WW|IR|FLY|null, label? }] (header x-admin-key). */
  @Put('lines')
  @Public()
  @UseGuards(AdminKeyGuard)
  setLines(@Body() body: { number: string; propertyCode: string | null; label?: string | null }[]) {
    if (!Array.isArray(body)) throw new BadRequestException('Expected an array');
    const rows = body.map((r) => {
      const number = vgpLine(r?.number);
      if (!number) throw new BadRequestException(`Not a VGP line: ${r?.number}`);
      const code = r.propertyCode ?? null;
      if (code !== null && !['WW', 'IR', 'FLY', 'VEL'].includes(code)) throw new BadRequestException(`Unknown property ${code}`);
      return { number, propertyCode: code, label: r.label ? String(r.label).slice(0, 80) : null };
    });
    return this.query.setLines(rows);
  }
}
