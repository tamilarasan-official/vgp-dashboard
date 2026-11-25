import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncRunService } from '../../sync/sync-run.service';

export const ZOHO_PROPERTIES = ['WW', 'IR', 'FLY', 'UNASSIGNED'] as const;
const n = (v: unknown) => Number(v ?? 0);

/**
 * Property of a lead: the "Industry" tag set by VGP; otherwise the property of the VGP line the customer called
 * (from zoho_line); otherwise UNASSIGNED. Calls: line mapping, otherwise the linked lead's property.
 * Mapping is applied at query time, so updating the line list re-assigns history immediately.
 */
const LEADS = Prisma.sql`
  SELECT l.*, (l.created_time AT TIME ZONE 'Asia/Kolkata') AS local_time,
         COALESCE(CASE l.industry WHEN 'VGP Wonder World' THEN 'WW' WHEN 'VGP Wonder Ice Rink' THEN 'IR'
                                  WHEN 'VGP Fly Dining' THEN 'FLY' END, ln.property_code, 'UNASSIGNED') AS prop
  FROM zoho_lead l LEFT JOIN zoho_line ln ON ln.number = l.vgp_line
  WHERE NOT l.is_deleted`;

const CALLS = Prisma.sql`
  SELECT c.*, (COALESCE(c.start_time, c.created_time) AT TIME ZONE 'Asia/Kolkata') AS local_time,
         COALESCE(ln.property_code, lp.prop, 'UNASSIGNED') AS prop
  FROM zoho_call c
  LEFT JOIN zoho_line ln ON ln.number = c.vgp_line
  LEFT JOIN (${LEADS}) lp ON lp.id = c.lead_id
  WHERE NOT c.is_deleted`;

@Injectable()
export class ZohoQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: SyncRunService,
  ) {}

  async summary(from: string, to: string, property: string) {
    const inRange = Prisma.sql`local_time::date BETWEEN ${from}::date AND ${to}::date`;
    const propF = property === 'ALL' ? Prisma.sql`TRUE` : Prisma.sql`prop = ${property}`;
    const L = (body: Prisma.Sql) => this.prisma.$queryRaw<any[]>`WITH x AS (${LEADS}) ${body}`;
    const C = (body: Prisma.Sql) => this.prisma.$queryRaw<any[]>`WITH x AS (${CALLS}) ${body}`;
    const where = Prisma.sql`WHERE ${inRange} AND ${propF}`;

    const [
      leadsByProperty,
      leadsBySource,
      leadsByStatus,
      leadsByOffer,
      leadsDaily,
      leadsByStaff,
      callsByProperty,
      callTotals,
      callsDaily,
      callsByHour,
      callsByStaff,
      byLine,
      properties,
      lastSync,
    ] = await Promise.all([
      L(Prisma.sql`SELECT prop, COUNT(*)::int AS leads FROM x WHERE ${inRange} GROUP BY prop`),
      L(Prisma.sql`SELECT COALESCE(lead_source, 'Not set') AS source, COUNT(*)::int AS leads FROM x ${where} GROUP BY 1 ORDER BY 2 DESC`),
      L(Prisma.sql`SELECT COALESCE(lead_status, 'Not set') AS status, COUNT(*)::int AS leads FROM x ${where} GROUP BY 1 ORDER BY 2 DESC`),
      L(Prisma.sql`SELECT offer, COUNT(*)::int AS leads FROM x ${where} AND offer IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
      L(Prisma.sql`
        SELECT to_char(local_time::date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS leads,
               COUNT(*) FILTER (WHERE lead_source = 'Facebook')::int AS facebook,
               COUNT(*) FILTER (WHERE lead_source = 'Smartflo')::int AS phone
        FROM x ${where} GROUP BY 1 ORDER BY 1`),
      L(Prisma.sql`
        SELECT COALESCE(u.name, 'Unassigned') AS staff, COUNT(*)::int AS leads,
               COUNT(*) FILTER (WHERE lead_status IN ('Interested', 'Call Back', 'Walkin'))::int AS interested,
               COUNT(*) FILTER (WHERE lead_status = 'Ticket Purchased')::int AS purchased
        FROM x LEFT JOIN zoho_user u ON u.id = x.owner_id ${where} GROUP BY 1 ORDER BY 2 DESC`),
      C(Prisma.sql`
        SELECT prop, COUNT(*) FILTER (WHERE call_type = 'Inbound')::int AS inbound,
               COUNT(*) FILTER (WHERE call_type = 'Missed')::int AS missed,
               COUNT(*) FILTER (WHERE call_type = 'Outbound')::int AS outbound
        FROM x WHERE ${inRange} GROUP BY prop`),
      C(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE call_type = 'Inbound')::int AS inbound,
               COUNT(*) FILTER (WHERE call_type = 'Missed')::int AS missed,
               COUNT(*) FILTER (WHERE call_type = 'Outbound')::int AS outbound,
               COUNT(*) FILTER (WHERE call_type = 'Outbound' AND COALESCE(duration_sec, 0) > 0)::int AS outbound_connected,
               COALESCE(SUM(duration_sec) FILTER (WHERE call_type IN ('Inbound', 'Outbound')), 0)::bigint AS talk_sec,
               COUNT(*) FILTER (WHERE call_type IN ('Inbound', 'Outbound') AND COALESCE(duration_sec, 0) > 0)::int AS talked
        FROM x ${where}`),
      C(Prisma.sql`
        SELECT to_char(local_time::date, 'YYYY-MM-DD') AS date,
               COUNT(*) FILTER (WHERE call_type = 'Inbound')::int AS inbound,
               COUNT(*) FILTER (WHERE call_type = 'Missed')::int AS missed,
               COUNT(*) FILTER (WHERE call_type = 'Outbound')::int AS outbound
        FROM x ${where} GROUP BY 1 ORDER BY 1`),
      C(Prisma.sql`
        SELECT EXTRACT(HOUR FROM local_time)::int AS hour,
               COUNT(*) FILTER (WHERE call_type = 'Inbound')::int AS inbound,
               COUNT(*) FILTER (WHERE call_type = 'Missed')::int AS missed
        FROM x ${where} AND call_type IN ('Inbound', 'Missed') GROUP BY 1 ORDER BY 1`),
      C(Prisma.sql`
        SELECT COALESCE(u.name, 'Unassigned') AS staff,
               COUNT(*) FILTER (WHERE call_type = 'Inbound')::int AS inbound,
               COUNT(*) FILTER (WHERE call_type = 'Outbound')::int AS outbound,
               COUNT(*) FILTER (WHERE call_type = 'Missed')::int AS missed,
               COALESCE(SUM(duration_sec) FILTER (WHERE call_type IN ('Inbound', 'Outbound')), 0)::bigint AS talk_sec
        FROM x LEFT JOIN zoho_user u ON u.id = x.owner_id ${where} GROUP BY 1 ORDER BY COUNT(*) DESC`),
      this.prisma.$queryRaw<any[]>`
        WITH c AS (${CALLS}), l AS (${LEADS}),
        cs AS (SELECT vgp_line, COUNT(*) FILTER (WHERE call_type = 'Inbound')::int AS inbound,
                      COUNT(*) FILTER (WHERE call_type = 'Missed')::int AS missed,
                      COUNT(*) FILTER (WHERE call_type = 'Outbound')::int AS outbound
               FROM c WHERE local_time::date BETWEEN ${from}::date AND ${to}::date AND vgp_line IS NOT NULL GROUP BY 1),
        ls AS (SELECT vgp_line, COUNT(*)::int AS leads,
                      COUNT(*) FILTER (WHERE industry IS NULL)::int AS untagged
               FROM l WHERE local_time::date BETWEEN ${from}::date AND ${to}::date AND vgp_line IS NOT NULL GROUP BY 1),
        nums AS (SELECT vgp_line FROM cs UNION SELECT vgp_line FROM ls UNION SELECT number FROM zoho_line)
        SELECT nums.vgp_line AS number, zl.property_code AS "propertyCode", zl.label,
               COALESCE(cs.inbound, 0) AS inbound, COALESCE(cs.missed, 0) AS missed, COALESCE(cs.outbound, 0) AS outbound,
               COALESCE(ls.leads, 0) AS leads, COALESCE(ls.untagged, 0) AS untagged
        FROM nums LEFT JOIN cs ON cs.vgp_line = nums.vgp_line LEFT JOIN ls ON ls.vgp_line = nums.vgp_line
        LEFT JOIN zoho_line zl ON zl.number = nums.vgp_line
        ORDER BY COALESCE(cs.inbound, 0) + COALESCE(cs.missed, 0) + COALESCE(ls.leads, 0) DESC`,
      this.prisma.property.findMany({ where: { code: { in: ['WW', 'IR', 'FLY'] } }, select: { code: true, name: true } }),
      this.runs.lastSuccess('zoho'),
    ]);

    const names: Record<string, string> = Object.fromEntries(properties.map((p) => [p.code, p.name]));
    names.UNASSIGNED = 'Not assigned yet';
    const t = callTotals[0] ?? {};
    const inbound = n(t.inbound);
    const missed = n(t.missed);
    const status = (s: string) => n(leadsByStatus.find((r) => r.status === s)?.leads);
    const totalLeads = leadsByStatus.reduce((s, r) => s + n(r.leads), 0);

    return {
      range: { from, to },
      property,
      propertyNames: names,
      lastSyncedAt: lastSync?.finishedAt ?? null,
      kpis: {
        leads: totalLeads,
        interested: status('Interested') + status('Call Back') + status('Walkin'),
        ticketPurchased: status('Ticket Purchased'),
        notInterested: status('Not Interested') + status('Junk Lead') + status('Out of State / Other Language'),
        newUntouched: status('New Leads'),
        inbound,
        missed,
        outbound: n(t.outbound),
        outboundConnected: n(t.outbound_connected),
        missedRate: inbound + missed ? missed / (inbound + missed) : 0,
        talkMinutes: Math.round(n(t.talk_sec) / 60),
        avgTalkSec: n(t.talked) ? Math.round(n(t.talk_sec) / n(t.talked)) : 0,
      },
      byProperty: ZOHO_PROPERTIES.map((code) => {
        const l = leadsByProperty.find((r) => r.prop === code);
        const c = callsByProperty.find((r) => r.prop === code);
        return { code, name: names[code] ?? code, leads: n(l?.leads), inbound: n(c?.inbound), missed: n(c?.missed), outbound: n(c?.outbound) };
      }),
      leadsBySource: leadsBySource.map((r) => ({ source: r.source, leads: n(r.leads) })),
      leadsByStatus: leadsByStatus.map((r) => ({ status: r.status, leads: n(r.leads) })),
      leadsByOffer: leadsByOffer.map((r) => ({ offer: r.offer, leads: n(r.leads) })),
      leadsByStaff: leadsByStaff.map((r) => ({ staff: r.staff, leads: n(r.leads), interested: n(r.interested), purchased: n(r.purchased) })),
      daily: mergeDaily(leadsDaily, callsDaily),
      callsByHour: callsByHour.map((r) => ({ hour: n(r.hour), inbound: n(r.inbound), missed: n(r.missed), total: n(r.inbound) + n(r.missed) })),
      callsByStaff: callsByStaff.map((r) => ({
        staff: r.staff,
        inbound: n(r.inbound),
        outbound: n(r.outbound),
        missed: n(r.missed),
        talkMinutes: Math.round(n(r.talk_sec) / 60),
      })),
      lines: byLine.map((r) => ({
        number: r.number,
        propertyCode: r.propertyCode,
        label: r.label,
        inbound: n(r.inbound),
        missed: n(r.missed),
        outbound: n(r.outbound),
        leads: n(r.leads),
        untagged: n(r.untagged),
      })),
    };
  }

  lines() {
    return this.prisma.zohoLine.findMany({ orderBy: { number: 'asc' } });
  }

  async setLines(rows: { number: string; propertyCode: string | null; label?: string | null }[]) {
    for (const r of rows) {
      await this.prisma.zohoLine.upsert({
        where: { number: r.number },
        create: { number: r.number, propertyCode: r.propertyCode, label: r.label ?? null },
        update: { propertyCode: r.propertyCode, label: r.label ?? null },
      });
    }
    return this.lines();
  }
}

function mergeDaily(leads: any[], calls: any[]) {
  const map = new Map<string, { date: string; leads: number; facebook: number; phone: number; inbound: number; missed: number; outbound: number }>();
  const get = (date: string) => {
    if (!map.has(date)) map.set(date, { date, leads: 0, facebook: 0, phone: 0, inbound: 0, missed: 0, outbound: 0 });
    return map.get(date)!;
  };
  for (const r of leads) Object.assign(get(r.date), { leads: n(r.leads), facebook: n(r.facebook), phone: n(r.phone) });
  for (const r of calls) Object.assign(get(r.date), { inbound: n(r.inbound), missed: n(r.missed), outbound: n(r.outbound) });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
