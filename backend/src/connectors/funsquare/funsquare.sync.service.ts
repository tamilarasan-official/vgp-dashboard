import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncRunService } from '../../sync/sync-run.service';
import { addDays, dateRange, istToday, parseIstDateTime, toDbDate } from '../../common/ist-date';
import { FsBillingRecord, FsPaymentRecord, FsPunchLog, FunsquareClient } from './funsquare.client';

interface StatisticsData {
  card_summary?: { issue_card_count?: number; return_card_count?: number };
  payment_summary?: {
    payment_modes?: Record<string, unknown>;
    totals?: { total_card_collection?: number; total_direct_sale?: number; grand_total?: number };
  };
  game_report?: { games?: unknown[]; summary?: { total_play_count?: number; total_amount?: number } };
  direct_items_report?: { items?: unknown[] };
  card_type_report?: { card_types?: unknown[] };
}

export interface DaySyncResult {
  date: string;
  payments: number;
  gamePlays: number;
  techPunches: number;
  grandTotal: number;
}

const num = (v: unknown) => new Prisma.Decimal(Number(v ?? 0) || 0);

@Injectable()
export class FunsquareSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FunsquareSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FunsquareClient,
    private readonly runs: SyncRunService,
  ) {}

  private get propertyCode() {
    return process.env.FUNSQUARE_PROPERTY_CODE ?? 'VEL';
  }

  /** On start-up: fill any days missed while the server was off (from the last synced day to today, max 62 days). */
  onApplicationBootstrap() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured()) return;
    setTimeout(async () => {
      try {
        const last = await this.prisma.fsDailyStat.aggregate({ _max: { businessDate: true } });
        const today = istToday();
        let from = last._max.businessDate ? last._max.businessDate.toISOString().slice(0, 10) : addDays(today, -6);
        if (from < addDays(today, -61)) from = addDays(today, -61);
        if (from < today) await this.syncRange(from, today, 'catch-up');
      } catch (e) {
        this.logger.error(`FunSquare catch-up failed: ${(e as Error).message}`);
      }
    }, 5_000);
  }

  /** Every 15 minutes: refresh today (and yesterday during the first hours after midnight). */
  @Cron('*/15 * * * *', { name: 'funsquare-incremental', timeZone: 'Asia/Kolkata' })
  async scheduledIncremental() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured()) return;
    const today = istToday();
    const hour = Number(new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(11, 13));
    const from = hour < 3 ? addDays(today, -1) : today;
    await this.syncRange(from, today, 'incremental').catch((e) => this.logger.error(`Incremental sync failed: ${e.message}`));
  }

  /** Nightly 02:30 IST: final re-check of the last 3 days (late edits / refunds). */
  @Cron('30 2 * * *', { name: 'funsquare-nightly', timeZone: 'Asia/Kolkata' })
  async scheduledNightly() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured()) return;
    const today = istToday();
    await this.syncRange(addDays(today, -3), addDays(today, -1), 'nightly').catch((e) =>
      this.logger.error(`Nightly sync failed: ${e.message}`),
    );
  }

  /** Sync each day in the range. Each day is replaced atomically, so edits and deletions in FunSquare are reflected. */
  async syncRange(from: string, to: string, jobType = 'manual'): Promise<DaySyncResult[]> {
    if (this.running) throw new Error('A FunSquare sync is already running');
    this.running = true;
    try {
      const property = await this.prisma.property.findUniqueOrThrow({ where: { code: this.propertyCode } });
      const results: DaySyncResult[] = [];
      for (const date of dateRange(from, to)) {
        const r = await this.runs.run(
          { sourceCode: 'funsquare', propertyCode: this.propertyCode, jobType, rangeFrom: toDbDate(date), rangeTo: toDbDate(date) },
          async () => {
            const day = await this.syncDay(property.id, date);
            return { ...day, read: day.payments + day.gamePlays + day.techPunches, written: day.payments + day.gamePlays + day.techPunches + 1 };
          },
        );
        results.push({ date: r.date, payments: r.payments, gamePlays: r.gamePlays, techPunches: r.techPunches, grandTotal: r.grandTotal });
      }
      this.logger.log(`FunSquare ${jobType} sync ${from}..${to}: ${results.length} day(s)`);
      return results;
    } finally {
      this.running = false;
    }
  }

  private async syncDay(propertyId: number, date: string): Promise<DaySyncResult> {
    const [payData, billData, stats, punchData] = await Promise.all([
      this.client.report<{ records?: FsPaymentRecord[] }>('payment/get', date, date),
      this.client.report<{ records?: FsBillingRecord[] }>('billing/get', date, date),
      this.client.report<StatisticsData>('statistics/get', date, date),
      this.client.report<{ logs?: FsPunchLog[] }>('techcard/get_punch_logs', date, date),
    ]);
    const payments = payData.records ?? [];
    const plays = billData.records ?? [];
    const punches = punchData.logs ?? [];
    const businessDate = toDbDate(date);

    // Only business fields are kept: customer name, phone, card RFID and GUID are dropped here.
    const paymentRows: Prisma.FsPaymentCreateManyInput[] = payments.map((p) => ({
      propertyId,
      paymentId: Number(p.payment_id),
      paymentMode: String(p.payment_mode ?? 'UNKNOWN').toUpperCase(),
      preAmount: num(p.pre_amount),
      rechargeAmount: num(p.recharge_amount),
      discountAmount: num(p.discount_amount),
      collectAmount: num(p.collect_amount),
      taxableAmount: num(p.taxable_amount),
      cgstAmount: num(p.cgst_amount),
      sgstAmount: num(p.sgst_amount),
      mainAmount: num(p.main_amount),
      bonusAmount: num(p.bonus_amount),
      postAmount: num(p.post_amount),
      cashier: p.user ?? null,
      paidAt: parseIstDateTime(p.date),
      businessDate,
    }));
    const playRows: Prisma.FsGamePlayCreateManyInput[] = plays.map((b) => ({
      propertyId,
      billingId: Number(b.billing_id),
      game: String(b.game ?? 'Unknown'),
      preAmount: num(b.pre_amount),
      paidAmount: num(b.paid_amount),
      postAmount: num(b.post_amount),
      playedAt: parseIstDateTime(b.date),
      businessDate,
    }));
    const punchRows: Prisma.FsTechPunchCreateManyInput[] = punches.map((t) => ({
      propertyId,
      punchId: Number(t.id),
      game: t.log_game ?? null,
      amount: num(t.amount),
      punchedAt: parseIstDateTime(t.created_at),
      businessDate,
    }));

    const totals = stats.payment_summary?.totals ?? {};
    const stat = {
      cardsIssued: Number(stats.card_summary?.issue_card_count ?? 0),
      cardsReturned: Number(stats.card_summary?.return_card_count ?? 0),
      cardCollection: num(totals.total_card_collection),
      directSale: num(totals.total_direct_sale),
      grandTotal: num(totals.grand_total),
      gamePlayCount: Number(stats.game_report?.summary?.total_play_count ?? 0),
      gamePlayAmount: num(stats.game_report?.summary?.total_amount),
      byPaymentMode: (stats.payment_summary?.payment_modes ?? {}) as Prisma.InputJsonValue,
      byGame: (stats.game_report?.games ?? []) as Prisma.InputJsonValue,
      directItems: (stats.direct_items_report?.items ?? []) as Prisma.InputJsonValue,
      cardTypes: (stats.card_type_report?.card_types ?? []) as Prisma.InputJsonValue,
    };

    await this.prisma.$transaction(async (tx) => {
      const where = { propertyId, businessDate };
      await tx.fsPayment.deleteMany({ where });
      await tx.fsGamePlay.deleteMany({ where });
      await tx.fsTechPunch.deleteMany({ where });
      if (paymentRows.length) await tx.fsPayment.createMany({ data: paymentRows, skipDuplicates: true });
      if (playRows.length) await tx.fsGamePlay.createMany({ data: playRows, skipDuplicates: true });
      if (punchRows.length) await tx.fsTechPunch.createMany({ data: punchRows, skipDuplicates: true });
      await tx.fsDailyStat.upsert({
        where: { propertyId_businessDate: { propertyId, businessDate } },
        create: { propertyId, businessDate, ...stat },
        update: { ...stat, syncedAt: new Date() },
      });
    }, { timeout: 60_000 });

    return { date, payments: paymentRows.length, gamePlays: playRows.length, techPunches: punchRows.length, grandTotal: Number(stat.grandTotal) };
  }
}
