import { Public, Roles } from '../../auth/auth.util';
import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AgentTokenGuard } from '../../common/agent-token.guard';
import { addDays, istToday, isIsoDate } from '../../common/ist-date';
import { TallyIngestService } from './tally.ingest.service';
import { TallyQueryService } from './tally.query.service';
import type { GuidCheckPayload, MastersPayload, VouchersPayload } from './tally.types';

/** Endpoints called by the on-site VGP agent (Bearer agent token). */
@Public()
@Controller('ingest/tally')
@UseGuards(AgentTokenGuard)
export class TallyIngestController {
  constructor(private readonly ingest: TallyIngestService) {}

  @Get('state')
  state(@Query('company') company: string) {
    if (!company) throw new BadRequestException('company is required');
    return this.ingest.state(company);
  }

  @Post('masters')
  masters(@Body() body: MastersPayload) {
    return this.ingest.masters(body);
  }

  @Post('vouchers')
  vouchers(@Body() body: VouchersPayload) {
    return this.ingest.vouchers(body);
  }

  @Post('guid-check')
  guidCheck(@Body() body: GuidCheckPayload) {
    return this.ingest.guidCheck(body);
  }

  @Post('heartbeat')
  async heartbeat(@Req() req: { agentId: string }, @Body() body: Record<string, unknown>) {
    await this.ingest.heartbeat(req.agentId, body ?? {});
    return { ok: true, serverTime: new Date() };
  }
}

/** Read endpoints for the dashboard. */
@Controller('tally')
export class TallyController {
  constructor(private readonly query: TallyQueryService) {}

  @Get('companies')
  @Roles('viewer')
  companies() {
    return this.query.companies();
  }

  /** GET /api/tally/summary?from&to&company (default: current financial year to today, all companies) */
  @Get('summary')
  @Roles('viewer')
  summary(@Query('from') from?: string, @Query('to') to?: string, @Query('company') company?: string) {
    const end = isIsoDate(to) ? to : istToday();
    const y = Number(end.slice(0, 4));
    const fyStart = Number(end.slice(5, 7)) >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
    const start = isIsoDate(from) ? from : fyStart;
    if (start > end) throw new BadRequestException('from must be before to');
    return this.query.summary(start, end, company || undefined);
  }

  /** Convenience: last N days. */
  @Get('summary/recent')
  @Roles('viewer')
  recent(@Query('days') days?: string) {
    const end = istToday();
    return this.query.summary(addDays(end, -Math.max(0, Number(days ?? 7) - 1)), end);
  }
}
