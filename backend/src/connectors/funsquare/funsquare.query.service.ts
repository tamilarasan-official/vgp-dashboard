import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncRunService } from '../../sync/sync-run.service';
import { toDbDate } from '../../common/ist-date';

const n = (v: Prisma.Decimal | number | bigint | null | undefined) => Number(v ?? 0);

/** Read-side queries for the Velocity (FunSquare) dashboard section. */
@Injectable()
export class FunsquareQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: SyncRunService,
  ) {}

  async summary(from: string, to: string) {
    const property = await this.prisma.property.findUniqueOrThrow({
      where: { code: process.env.FUNSQUARE_PROPERTY_CODE ?? 'VEL' },
    });
    const range = { propertyId: property.id, businessDate: { gte: toDbDate(from), lte: toDbDate(to) } };

    const [daily, payAgg, byMode, byCashier, playAgg, byGame, byHour, lastSync] = await Promise.all([
      this.prisma.fsDailyStat.findMany({ where: range, orderBy: { businessDate: 'asc' } }),
      this.prisma.fsPayment.aggregate({
        where: range,
        _count: true,
        _sum: { collectAmount: true, taxableAmount: true, cgstAmount: true, sgstAmount: true, bonusAmount: true, discountAmount: true },
      }),
      this.prisma.fsPayment.groupBy({ by: ['paymentMode'], where: range, _count: true, _sum: { collectAmount: true } }),
      this.prisma.fsPayment.groupBy({ by: ['cashier'], where: range, _count: true, _sum: { collectAmount: true } }),
      this.prisma.fsGamePlay.aggregate({ where: range, _count: true, _sum: { paidAmount: true } }),
      this.prisma.fsGamePlay.groupBy({ by: ['game'], where: range, _count: true, _sum: { paidAmount: true } }),
      this.prisma.$queryRaw<{ hour: number; plays: bigint; amount: Prisma.Decimal }[]>`
        SELECT EXTRACT(HOUR FROM played_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
               COUNT(*) AS plays, COALESCE(SUM(paid_amount), 0) AS amount
        FROM fs_game_play
        WHERE property_id = ${property.id} AND business_date BETWEEN ${toDbDate(from)} AND ${toDbDate(to)}
        GROUP BY 1 ORDER BY 1`,
      this.runs.lastSuccess('funsquare'),
    ]);

    const sumDaily = (k: 'cardsIssued' | 'cardCollection' | 'directSale' | 'grandTotal') =>
      daily.reduce((s, d) => s + n(d[k] as Prisma.Decimal | number), 0);

    return {
      property: { code: property.code, name: property.name },
      range: { from, to },
      lastSyncedAt: lastSync?.finishedAt ?? null,
      kpis: {
        grandTotal: sumDaily('grandTotal'),
        cardCollection: sumDaily('cardCollection'),
        directSale: sumDaily('directSale'),
        cardsIssued: sumDaily('cardsIssued'),
        recharges: payAgg._count,
        rechargeCollected: n(payAgg._sum.collectAmount),
        taxable: n(payAgg._sum.taxableAmount),
        gst: n(payAgg._sum.cgstAmount) + n(payAgg._sum.sgstAmount),
        bonusCredits: n(payAgg._sum.bonusAmount),
        discount: n(payAgg._sum.discountAmount),
        gamePlays: playAgg._count,
        gamePlayValue: n(playAgg._sum.paidAmount),
      },
      daily: daily.map((d) => ({
        date: d.businessDate.toISOString().slice(0, 10),
        grandTotal: n(d.grandTotal),
        cardCollection: n(d.cardCollection),
        directSale: n(d.directSale),
        cardsIssued: d.cardsIssued,
        gamePlays: d.gamePlayCount,
      })),
      byPaymentMode: byMode
        .map((m) => ({ mode: m.paymentMode, count: m._count, amount: n(m._sum.collectAmount) }))
        .sort((a, b) => b.amount - a.amount),
      byCashier: byCashier
        .map((c) => ({ cashier: c.cashier ?? 'unknown', count: c._count, amount: n(c._sum.collectAmount) }))
        .sort((a, b) => b.amount - a.amount),
      byGame: byGame
        .map((g) => ({ game: g.game, plays: g._count, amount: n(g._sum.paidAmount) }))
        .sort((a, b) => b.amount - a.amount),
      byHour: byHour.map((h) => ({ hour: h.hour, plays: Number(h.plays), amount: n(h.amount) })),
    };
  }
}
