import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toDbDate, isIsoDate } from '../../common/ist-date';
import { GuidCheckPayload, MastersPayload, TallyGroupIn, VouchersPayload } from './tally.types';

const dec = (v: unknown) => new Prisma.Decimal(Number(v ?? 0) || 0);

/** Walk up the group tree to the top-level Tally group ("Primary" is Tally's root). */
export function primaryGroupOf(name: string | null, byName: Map<string, TallyGroupIn>): string {
  let current = name;
  for (let guard = 0; current && guard < 50; guard++) {
    const g = byName.get(current);
    if (!g || !g.parent || g.parent === 'Primary') return current;
    current = g.parent;
  }
  return current ?? 'Unknown';
}

@Injectable()
export class TallyIngestService {
  constructor(private readonly prisma: PrismaService) {}

  private async company(name: string) {
    const c = await this.prisma.tallyCompany.findUnique({ where: { name } });
    if (!c) throw new NotFoundException(`Unknown Tally company "${name}" - send masters first`);
    return c;
  }

  async state(name: string) {
    const c = await this.prisma.tallyCompany.findUnique({ where: { name } });
    return {
      company: name,
      known: !!c,
      lastAlterId: Number(c?.lastAlterId ?? 0),
      lastMasterSync: c?.lastMasterSync ?? null,
      lastFullCheck: c?.lastFullCheck ?? null,
    };
  }

  /** Replace groups and ledgers for the company (handles renames and deletions). */
  async masters(p: MastersPayload) {
    if (!p?.company || !Array.isArray(p.groups) || !Array.isArray(p.ledgers)) throw new BadRequestException('Invalid masters payload');
    const company = await this.prisma.tallyCompany.upsert({
      where: { name: p.company },
      create: { name: p.company, booksFrom: isIsoDate(p.booksFrom) ? toDbDate(p.booksFrom) : null },
      update: { booksFrom: isIsoDate(p.booksFrom) ? toDbDate(p.booksFrom) : undefined },
    });
    const byName = new Map(p.groups.map((g) => [g.name, g]));
    const groupRows = p.groups.map((g) => ({
      companyId: company.id,
      name: g.name,
      parent: g.parent && g.parent !== 'Primary' ? g.parent : null,
      primaryGroup: primaryGroupOf(g.name, byName),
      isRevenue: !!g.isRevenue,
      affectsGrossProfit: !!g.affectsGrossProfit,
      isDeemedPositive: !!g.isDeemedPositive,
    }));
    const ledgerRows = p.ledgers.map((l) => ({
      companyId: company.id,
      name: l.name,
      parent: l.parent,
      primaryGroup: primaryGroupOf(l.parent, byName),
      isRevenue: !!byName.get(l.parent ?? '')?.isRevenue,
      openingBalance: dec(l.openingBalance),
      closingBalance: dec(l.closingBalance),
      alterId: BigInt(Math.trunc(Number(l.alterId) || 0)),
    }));
    await this.prisma.$transaction(
      async (tx) => {
        await tx.tallyGroup.deleteMany({ where: { companyId: company.id } });
        await tx.tallyLedger.deleteMany({ where: { companyId: company.id } });
        if (groupRows.length) await tx.tallyGroup.createMany({ data: groupRows, skipDuplicates: true });
        if (ledgerRows.length) await tx.tallyLedger.createMany({ data: ledgerRows, skipDuplicates: true });
        await tx.tallyCompany.update({ where: { id: company.id }, data: { lastMasterSync: new Date() } });
      },
      { timeout: 60_000 },
    );
    return { company: p.company, groups: groupRows.length, ledgers: ledgerRows.length };
  }

  /** Upsert a batch of vouchers by GUID (lines are replaced). Advances the AlterID cursor. */
  async vouchers(p: VouchersPayload) {
    if (!p?.company || !Array.isArray(p.vouchers)) throw new BadRequestException('Invalid vouchers payload');
    if (p.vouchers.length > 2000) throw new BadRequestException('Max 2000 vouchers per batch');
    const company = await this.company(p.company);
    const valid = p.vouchers.filter((v) => v.guid && isIsoDate(v.date));
    if (!valid.length) return { company: p.company, vouchers: 0, lines: 0, lastAlterId: Number(company.lastAlterId) };
    const guids = valid.map((v) => v.guid);
    const maxAlter = valid.reduce((m, v) => Math.max(m, Number(v.alterId) || 0), Number(company.lastAlterId));

    const lineCount = await this.prisma.$transaction(
      async (tx) => {
        await tx.tallyVoucher.deleteMany({ where: { companyId: company.id, guid: { in: guids } } }); // lines cascade
        await tx.tallyVoucher.createMany({
          data: valid.map((v) => ({
            companyId: company.id,
            guid: v.guid,
            alterId: BigInt(Math.trunc(Number(v.alterId) || 0)),
            masterId: v.masterId != null ? BigInt(Math.trunc(Number(v.masterId))) : null,
            date: toDbDate(v.date),
            voucherType: v.voucherType || 'Unknown',
            voucherNumber: v.voucherNumber,
            partyLedger: v.partyLedger,
            isCancelled: !!v.isCancelled,
            isOptional: !!v.isOptional,
          })),
          skipDuplicates: true,
        });
        const ids = await tx.tallyVoucher.findMany({
          where: { companyId: company.id, guid: { in: guids } },
          select: { id: true, guid: true },
        });
        const idByGuid = new Map(ids.map((r) => [r.guid, r.id]));
        const lines: Prisma.TallyVoucherLineCreateManyInput[] = [];
        for (const v of valid) {
          const voucherId = idByGuid.get(v.guid);
          if (!voucherId) continue;
          (v.lines ?? []).forEach((l, i) =>
            lines.push({
              voucherId,
              lineNo: i + 1,
              ledgerName: l.ledgerName,
              amount: dec(l.amount),
              isDeemedPositive: !!l.isDeemedPositive,
              costCentres: l.costCentres?.length ? (l.costCentres as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            }),
          );
        }
        for (let i = 0; i < lines.length; i += 5000) await tx.tallyVoucherLine.createMany({ data: lines.slice(i, i + 5000) });
        await tx.tallyCompany.update({
          where: { id: company.id },
          data: { lastAlterId: BigInt(maxAlter), lastVoucherSync: new Date() },
        });
        return lines.length;
      },
      { timeout: 120_000 },
    );
    return { company: p.company, vouchers: valid.length, lines: lineCount, lastAlterId: maxAlter };
  }

  /** Nightly check: vouchers in the date range that Tally no longer has are marked deleted. */
  async guidCheck(p: GuidCheckPayload) {
    if (!p?.company || !isIsoDate(p.from) || !isIsoDate(p.to) || !Array.isArray(p.guids)) {
      throw new BadRequestException('Invalid guid-check payload');
    }
    const company = await this.company(p.company);
    const from = toDbDate(p.from);
    const to = toDbDate(p.to);
    const deleted = await this.prisma.$executeRaw`
      UPDATE tally_voucher SET is_deleted = true
      WHERE company_id = ${company.id} AND date BETWEEN ${from} AND ${to}
        AND is_deleted = false AND NOT (guid = ANY(${p.guids}::text[]))`;
    const restored = await this.prisma.$executeRaw`
      UPDATE tally_voucher SET is_deleted = false
      WHERE company_id = ${company.id} AND is_deleted = true AND guid = ANY(${p.guids}::text[])`;
    await this.prisma.tallyCompany.update({ where: { id: company.id }, data: { lastFullCheck: new Date() } });
    return { company: p.company, checked: p.guids.length, markedDeleted: deleted, restored };
  }

  heartbeat(agentId: string, info: Record<string, unknown>) {
    return this.prisma.agentHeartbeat.upsert({
      where: { agentId },
      create: { agentId, info: info as Prisma.InputJsonValue },
      update: { lastSeen: new Date(), info: info as Prisma.InputJsonValue },
    });
  }
}
