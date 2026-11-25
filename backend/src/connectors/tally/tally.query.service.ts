import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toDbDate } from '../../common/ist-date';
import { EXPENSE_PRIMARY, INCOME_PRIMARY } from './tally.types';

const n = (v: unknown) => Number(v ?? 0);

/**
 * Read-side Tally figures for the dashboard.
 * Until the accountant's ledger mapping arrives, P&L uses Tally's own top-level groups
 * (Sales / Direct & Indirect Incomes vs Purchase / Direct & Indirect Expenses).
 */
@Injectable()
export class TallyQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async companies() {
    const rows = await this.prisma.tallyCompany.findMany({ orderBy: { name: 'asc' } });
    return rows.map((c) => ({
      name: c.name,
      booksFrom: c.booksFrom?.toISOString().slice(0, 10) ?? null,
      lastAlterId: Number(c.lastAlterId),
      lastVoucherSync: c.lastVoucherSync,
      lastMasterSync: c.lastMasterSync,
      lastFullCheck: c.lastFullCheck,
    }));
  }

  async summary(from: string, to: string, companyName?: string) {
    const companies = await this.prisma.tallyCompany.findMany({
      where: companyName ? { name: companyName } : {},
      orderBy: { name: 'asc' },
    });
    const ids = companies.map((c) => c.id);
    if (!ids.length) return { range: { from, to }, companies: [], empty: true };
    const f = toDbDate(from);
    const t = toDbDate(to);
    const idList = Prisma.join(ids);

    // P&L lines in range: only live vouchers, joined to the ledger's top-level group.
    const base = Prisma.sql`
      FROM tally_voucher_line l
      JOIN tally_voucher v ON v.id = l.voucher_id
      JOIN tally_ledger g ON g.company_id = v.company_id AND g.name = l.ledger_name
      WHERE v.company_id IN (${idList}) AND v.date BETWEEN ${f} AND ${t}
        AND v.is_cancelled = false AND v.is_deleted = false AND v.is_optional = false`;

    const [byPrimary, topLedgers, monthly, byType, lastVoucher] = await Promise.all([
      this.prisma.$queryRaw<{ primary_group: string; amount: Prisma.Decimal }[]>`
        SELECT g.primary_group, SUM(l.amount) AS amount ${base} AND g.is_revenue = true
        GROUP BY g.primary_group ORDER BY 1`,
      this.prisma.$queryRaw<{ ledger: string; primary_group: string; amount: Prisma.Decimal }[]>`
        SELECT l.ledger_name AS ledger, g.primary_group, SUM(l.amount) AS amount ${base} AND g.is_revenue = true
        GROUP BY 1, 2 ORDER BY ABS(SUM(l.amount)) DESC LIMIT 40`,
      this.prisma.$queryRaw<{ month: string; primary_group: string; amount: Prisma.Decimal }[]>`
        SELECT to_char(v.date, 'YYYY-MM') AS month, g.primary_group, SUM(l.amount) AS amount ${base} AND g.is_revenue = true
        GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<{ voucher_type: string; count: bigint }[]>`
        SELECT voucher_type, COUNT(*) AS count FROM tally_voucher
        WHERE company_id IN (${idList}) AND date BETWEEN ${f} AND ${t} AND is_deleted = false AND is_cancelled = false
        GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ last_date: Date | null }[]>`
        SELECT MAX(date) AS last_date FROM tally_voucher WHERE company_id IN (${idList}) AND is_deleted = false`,
    ]);

    const sign = (group: string, amount: number) => (EXPENSE_PRIMARY.includes(group) ? -amount : amount);
    const groupTotals = byPrimary.map((r) => ({ group: r.primary_group, amount: sign(r.primary_group, n(r.amount)) }));
    const sumOf = (names: string[]) => groupTotals.filter((g) => names.includes(g.group)).reduce((s, g) => s + g.amount, 0);
    const income = sumOf(INCOME_PRIMARY);
    const expenses = sumOf(EXPENSE_PRIMARY);
    const other = groupTotals.filter((g) => !INCOME_PRIMARY.includes(g.group) && !EXPENSE_PRIMARY.includes(g.group));

    const months = new Map<string, { month: string; income: number; expenses: number }>();
    for (const r of monthly) {
      const m = months.get(r.month) ?? { month: r.month, income: 0, expenses: 0 };
      if (INCOME_PRIMARY.includes(r.primary_group)) m.income += n(r.amount);
      if (EXPENSE_PRIMARY.includes(r.primary_group)) m.expenses += -n(r.amount);
      months.set(r.month, m);
    }

    // Balances "as of last sync" from ledger closing balances (Tally: debit negative).
    const [groups, ledgers] = await Promise.all([
      this.prisma.tallyGroup.findMany({ where: { companyId: { in: ids } }, select: { companyId: true, name: true, parent: true } }),
      this.prisma.tallyLedger.findMany({ where: { companyId: { in: ids } }, select: { companyId: true, name: true, parent: true, closingBalance: true } }),
    ]);
    const parentOf = new Map(groups.map((g) => [`${g.companyId}|${g.name}`, g.parent]));
    const underGroup = (companyId: number, parent: string | null, target: string) => {
      let cur = parent;
      for (let i = 0; cur && i < 50; i++) {
        if (cur === target) return true;
        cur = parentOf.get(`${companyId}|${cur}`) ?? null;
      }
      return false;
    };
    const balanceUnder = (target: string, debitPositive: boolean) =>
      ledgers
        .filter((l) => underGroup(l.companyId, l.parent, target))
        .reduce((s, l) => s + (debitPositive ? -n(l.closingBalance) : n(l.closingBalance)), 0);

    return {
      range: { from, to },
      companies: companies.map((c) => ({ name: c.name, lastVoucherSync: c.lastVoucherSync, lastAlterId: Number(c.lastAlterId) })),
      lastVoucherDate: lastVoucher[0]?.last_date?.toISOString().slice(0, 10) ?? null,
      pnl: {
        income,
        expenses,
        net: income - expenses,
        note: 'Based on Tally top-level groups. Excludes stock adjustments; final P&L needs the accountant mapping.',
      },
      byGroup: groupTotals.sort((a, b) => b.amount - a.amount),
      otherRevenueGroups: other,
      monthly: [...months.values()],
      topIncome: topLedgers
        .filter((l) => INCOME_PRIMARY.includes(l.primary_group))
        .slice(0, 10)
        .map((l) => ({ ledger: l.ledger, group: l.primary_group, amount: n(l.amount) })),
      topExpenses: topLedgers
        .filter((l) => EXPENSE_PRIMARY.includes(l.primary_group))
        .slice(0, 10)
        .map((l) => ({ ledger: l.ledger, group: l.primary_group, amount: -n(l.amount) })),
      balances: {
        cash: balanceUnder('Cash-in-Hand', true),
        bank: balanceUnder('Bank Accounts', true),
        receivables: balanceUnder('Sundry Debtors', true),
        payables: balanceUnder('Sundry Creditors', false),
      },
      vouchersByType: byType.map((r) => ({ type: r.voucher_type, count: Number(r.count) })),
    };
  }
}
