import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncRunService } from '../../sync/sync-run.service';
import { ZohoClient } from './zoho.client';

type Row = Record<string, any>;

const PAGE = 2000; // COQL maximum per query
const LEAD_FIELDS = 'id, Created_Time, Modified_Time, Industry, Lead_Source, Lead_Status, Company, To_Number, Owner, Converted__s';
const CALL_FIELDS =
  'id, Call_Start_Time, Created_Time, Modified_Time, Call_Type, Call_Result, Call_Purpose, Outgoing_Call_Status, Call_Duration_in_seconds, Dialled_Number, Caller_ID, Who_Id, Owner';

/** Keep a number ONLY if it is a VGP line (+91 8065 xxxxxx virtual numbers). Customer numbers are never stored. */
export function vgpLine(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    let d = c.replace(/[^\d]/g, '');
    if (d.length === 10) d = `91${d}`;
    if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
    if (/^918065\d{6}$/.test(d)) return `+${d}`;
  }
  return null;
}

const idOf = (v: unknown): string | null => (v && typeof v === 'object' && 'id' in v ? String((v as Row).id) : null);
const dt = (v: unknown) => (typeof v === 'string' && v ? new Date(v) : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v !== '-None-' ? v.trim() : null);
/** Zoho COQL datetime literal in IST. */
const coqlTime = (d: Date) => `${new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 19)}+05:30`;

@Injectable()
export class ZohoSyncService {
  private readonly logger = new Logger(ZohoSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ZohoClient,
    private readonly runs: SyncRunService,
  ) {}

  /** Every 15 minutes: fetch leads and calls created or changed since the last sync. */
  @Cron('*/15 * * * *', { name: 'zoho-incremental', timeZone: 'Asia/Kolkata' })
  async scheduledIncremental() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured() || this.running) return;
    await this.sync('incremental').catch((e) => this.logger.error(`Zoho incremental sync failed: ${e.message}`));
  }

  /** Nightly 03:00 IST: also pick up records deleted in Zoho. */
  @Cron('0 3 * * *', { name: 'zoho-nightly', timeZone: 'Asia/Kolkata' })
  async scheduledNightly() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured() || this.running) return;
    await this.sync('nightly').catch((e) => this.logger.error(`Zoho nightly sync failed: ${e.message}`));
  }

  /** full = re-read everything; otherwise only records modified since the newest one we already have. */
  async sync(jobType: 'incremental' | 'nightly' | 'full' | 'manual' = 'manual') {
    if (this.running) throw new Error('A Zoho sync is already running');
    this.running = true;
    try {
      return await this.runs.run({ sourceCode: 'zoho', jobType }, async () => {
        const users = await this.syncUsers();
        const leads = await this.syncModule('Leads', jobType === 'full');
        const calls = await this.syncModule('Calls', jobType === 'full');
        let deleted = 0;
        if (jobType === 'nightly' || jobType === 'full') {
          deleted = (await this.markDeleted('Leads')) + (await this.markDeleted('Calls'));
        }
        await this.prisma.sourceSystem.update({ where: { code: 'zoho' }, data: { status: 'live' } });
        this.logger.log(`Zoho ${jobType}: ${leads} leads, ${calls} calls, ${users} users, ${deleted} deleted`);
        return { users, leads, calls, deleted, read: leads + calls + users, written: leads + calls + users + deleted };
      });
    } finally {
      this.running = false;
    }
  }

  private async syncUsers(): Promise<number> {
    let n = 0;
    for (let page = 1; page <= 10; page++) {
      const r = await this.client.get<{ users?: Row[]; info?: { more_records?: boolean } }>(
        `/users?type=AllUsers&page=${page}&per_page=200`,
      );
      for (const u of r?.users ?? []) {
        const name = str(u.full_name) ?? ([u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown');
        const active = u.status === 'active';
        await this.prisma.zohoUser.upsert({
          where: { id: String(u.id) },
          create: { id: String(u.id), name, active },
          update: { name, active },
        });
        n++;
      }
      if (!r?.info?.more_records) break;
    }
    return n;
  }

  /** Page through a module with COQL, ordered by Modified_Time. Each page is replaced atomically. */
  private async syncModule(module: 'Leads' | 'Calls', full: boolean): Promise<number> {
    const latest =
      module === 'Leads'
        ? await this.prisma.zohoLead.aggregate({ _max: { modifiedTime: true } })
        : await this.prisma.zohoCall.aggregate({ _max: { modifiedTime: true } });
    // Overlap 5 minutes so nothing is missed at the boundary.
    let since =
      !full && latest._max.modifiedTime
        ? new Date(latest._max.modifiedTime.getTime() - 5 * 60_000)
        : new Date('2000-01-01T00:00:00Z');
    const fields = module === 'Leads' ? LEAD_FIELDS : CALL_FIELDS;
    const seen = new Set<string>();
    let total = 0;

    for (let guard = 0; guard < 500; guard++) {
      const rows = await this.client.coql<Row>(
        `select ${fields} from ${module} where Modified_Time >= '${coqlTime(since)}' order by Modified_Time asc, id asc limit ${PAGE}`,
      );
      const fresh = rows.filter((r) => !seen.has(String(r.id)));
      if (fresh.length) {
        fresh.forEach((r) => seen.add(String(r.id)));
        await (module === 'Leads' ? this.saveLeads(fresh) : this.saveCalls(fresh));
        total += fresh.length;
      }
      if (rows.length < PAGE) break;
      const last = dt(rows[rows.length - 1].Modified_Time)!;
      // If a whole page shares one timestamp, step 1 second forward to avoid looping.
      since = last.getTime() <= since.getTime() ? new Date(since.getTime() + 1000) : last;
    }
    return total;
  }

  private async saveLeads(rows: Row[]) {
    const data: Prisma.ZohoLeadCreateManyInput[] = rows.map((r) => ({
      id: BigInt(r.id),
      createdTime: dt(r.Created_Time)!,
      modifiedTime: dt(r.Modified_Time)!,
      industry: str(r.Industry),
      leadSource: str(r.Lead_Source),
      leadStatus: str(r.Lead_Status),
      offer: str(r.Company),
      vgpLine: vgpLine(r.To_Number),
      ownerId: idOf(r.Owner),
      converted: r.Converted__s === true,
    }));
    const ids = data.map((d) => BigInt(d.id));
    await this.prisma.$transaction(
      [this.prisma.zohoLead.deleteMany({ where: { id: { in: ids } } }), this.prisma.zohoLead.createMany({ data })],
    );
  }

  private async saveCalls(rows: Row[]) {
    const data: Prisma.ZohoCallCreateManyInput[] = rows.map((r) => {
      const type = str(r.Call_Type) ?? 'Unknown';
      const who = idOf(r.Who_Id);
      return {
        id: BigInt(r.id),
        startTime: dt(r.Call_Start_Time),
        createdTime: dt(r.Created_Time)!,
        modifiedTime: dt(r.Modified_Time)!,
        callType: type,
        callResult: str(r.Call_Result),
        callPurpose: str(r.Call_Purpose),
        outgoingStatus: str(r.Outgoing_Call_Status),
        durationSec: r.Call_Duration_in_seconds == null ? null : Number(r.Call_Duration_in_seconds) || 0,
        // Inbound/missed: the dialled number is VGP's line. Outbound: VGP's line is the caller id.
        vgpLine: type === 'Outbound' ? vgpLine(r.Caller_ID, r.Dialled_Number) : vgpLine(r.Dialled_Number, r.Caller_ID),
        leadId: who && /^\d+$/.test(who) ? BigInt(who) : null,
        ownerId: idOf(r.Owner),
      };
    });
    const ids = data.map((d) => BigInt(d.id));
    await this.prisma.$transaction(
      [this.prisma.zohoCall.deleteMany({ where: { id: { in: ids } } }), this.prisma.zohoCall.createMany({ data })],
    );
  }

  /** Records deleted in Zoho are flagged and hidden from the dashboard. */
  private async markDeleted(module: 'Leads' | 'Calls'): Promise<number> {
    const ids: bigint[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await this.client.get<{ data?: Row[]; info?: { more_records?: boolean } }>(
        `/${module}/deleted?type=all&page=${page}&per_page=200`,
      );
      (r?.data ?? []).forEach((d) => ids.push(BigInt(d.id)));
      if (!r?.info?.more_records) break;
    }
    if (!ids.length) return 0;
    const where = { id: { in: ids }, isDeleted: false };
    const res =
      module === 'Leads'
        ? await this.prisma.zohoLead.updateMany({ where, data: { isDeleted: true } })
        : await this.prisma.zohoCall.updateMany({ where, data: { isDeleted: true } });
    return res.count;
  }
}
