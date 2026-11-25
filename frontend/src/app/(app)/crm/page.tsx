import Link from 'next/link';
import { apiGet, fmtDateTime, fmtInt } from '@/lib/api';

type Summary = {
  range: { from: string; to: string };
  property: string;
  propertyNames: Record<string, string>;
  lastSyncedAt: string | null;
  kpis: {
    leads: number;
    interested: number;
    ticketPurchased: number;
    notInterested: number;
    newUntouched: number;
    inbound: number;
    missed: number;
    outbound: number;
    outboundConnected: number;
    missedRate: number;
    talkMinutes: number;
    avgTalkSec: number;
  };
  byProperty: { code: string; name: string; leads: number; inbound: number; missed: number; outbound: number }[];
  leadsBySource: { source: string; leads: number }[];
  leadsByStatus: { status: string; leads: number }[];
  leadsByOffer: { offer: string; leads: number }[];
  leadsByStaff: { staff: string; leads: number; interested: number; purchased: number }[];
  daily: { date: string; leads: number; facebook: number; phone: number; inbound: number; missed: number; outbound: number }[];
  callsByHour: { hour: number; inbound: number; missed: number; total: number }[];
  callsByStaff: { staff: string; inbound: number; outbound: number; missed: number; talkMinutes: number }[];
  lines: { number: string; propertyCode: string | null; label: string | null; inbound: number; missed: number; outbound: number; leads: number; untagged: number }[];
};

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
];
const PROPS = [
  { code: 'ALL', label: 'All properties' },
  { code: 'WW', label: 'Wonder World' },
  { code: 'IR', label: 'Ice Rink' },
  { code: 'FLY', label: 'Fly Dining' },
  { code: 'UNASSIGNED', label: 'Not assigned' },
];

function istToday() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const share = (a: number, b: number) => (b ? pct(a / b) : '–');
const fmtLine = (n: string) => n.replace(/^\+91(\d{2})(\d{4})(\d{4})$/, '0$1-$2-$3');
const mins = (m: number) => (m >= 60 ? `${fmtInt(Math.floor(m / 60))}h ${m % 60}m` : `${m}m`);

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'warn' ? 'text-rose-600 dark:text-rose-400' : ''}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

function Bars({ rows, label, value, format = fmtInt }: { rows: Record<string, unknown>[]; label: string; value: string; format?: (v: number) => string }) {
  if (!rows.length) return <p className="text-sm text-muted">No data in this period.</p>;
  const max = Math.max(1, ...rows.map((r) => Number(r[value])));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={String(r[label])} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{String(r[label])}</span>
            <span className="tabular-nums text-muted">{format(Number(r[value]))}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-subtle">
            <div className="h-2 rounded bg-accent" style={{ width: `${(Number(r[value]) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Answered (accent) + missed (rose) per hour. */
function HourBars({ rows }: { rows: Summary['callsByHour'] }) {
  if (!rows.length) return <p className="text-sm text-muted">No calls in this period.</p>;
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.hour} className="text-sm">
            <div className="flex justify-between gap-2">
              <span>{String(r.hour).padStart(2, '0')}:00</span>
              <span className="tabular-nums text-muted">
                {fmtInt(r.total)} · {share(r.missed, r.total)} missed
              </span>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded bg-subtle">
              <div className="h-2 bg-accent" style={{ width: `${(r.inbound / max) * 100}%` }} />
              <div className="h-2 bg-rose-500" style={{ width: `${(r.missed / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-3 rounded bg-accent" />Answered</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded bg-rose-500" />Missed</span>
      </p>
    </>
  );
}

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; property?: string }> }) {
  const sp = await searchParams;
  const to = sp.to ?? istToday();
  const from = sp.from ?? addDays(to, -6);
  const property = PROPS.some((p) => p.code === sp.property) ? sp.property! : 'ALL';
  const data = await apiGet<Summary>(`/zoho/summary?from=${from}&to=${to}&property=${property}`);
  const href = (q: { from?: string; to?: string; property?: string }) => {
    const p = { from, to, property, ...q };
    return `/crm?from=${p.from}&to=${p.to}${p.property !== 'ALL' ? `&property=${p.property}` : ''}`;
  };
  const unassigned = data?.byProperty.find((p) => p.code === 'UNASSIGNED');
  const unmappedLines = data?.lines.filter((l) => !l.propertyCode).length ?? 0;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leads &amp; Calls</h1>
          <p className="text-sm text-muted">
            Source: Zoho CRM · {from} to {to} · last synced {fmtDateTime(data?.lastSyncedAt ?? null)}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {PRESETS.map((p) => {
            const t = istToday();
            return (
              <Link key={p.label} href={href({ from: addDays(t, -p.days), to: t })} className="rounded border border-line bg-card px-3 py-1 hover:bg-subtle">
                {p.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {PROPS.map((p) => (
          <Link
            key={p.code}
            href={href({ property: p.code })}
            className={`rounded-full border px-3 py-1 ${property === p.code ? 'border-accent bg-accent text-white' : 'border-line bg-card hover:bg-subtle'}`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {!data ? (
        <p className="mt-6 rounded border border-rose-300 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">Could not load data from the backend.</p>
      ) : (
        <>
          {unassigned && (unassigned.leads > 0 || unassigned.inbound + unassigned.missed > 0) && unmappedLines > 0 && (
            <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {fmtInt(unassigned.leads)} leads and {fmtInt(unassigned.inbound + unassigned.missed + unassigned.outbound)} calls in this period are not linked to a property yet.
              They will be assigned automatically once each VGP phone line is mapped to its property ({unmappedLines} lines pending).
            </p>
          )}

          <h2 className="mt-6 text-sm font-medium text-muted">Leads</h2>
          <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="New leads" value={fmtInt(data.kpis.leads)} />
            <Kpi label="Interested" value={fmtInt(data.kpis.interested)} note={`${share(data.kpis.interested, data.kpis.leads)} · interested, call back, walk-in`} />
            <Kpi label="Ticket purchased" value={fmtInt(data.kpis.ticketPurchased)} note={share(data.kpis.ticketPurchased, data.kpis.leads)} />
            <Kpi label="Not interested / junk" value={fmtInt(data.kpis.notInterested)} note={share(data.kpis.notInterested, data.kpis.leads)} />
            <Kpi label="Still 'New Leads'" value={fmtInt(data.kpis.newUntouched)} note="Status not updated yet" />
          </section>

          <h2 className="mt-6 text-sm font-medium text-muted">Calls</h2>
          <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Incoming answered" value={fmtInt(data.kpis.inbound)} />
            <Kpi
              label="Missed calls"
              value={fmtInt(data.kpis.missed)}
              note={`${pct(data.kpis.missedRate)} of incoming calls missed`}
              tone={data.kpis.missedRate >= 0.3 ? 'warn' : undefined}
            />
            <Kpi label="Outgoing calls" value={fmtInt(data.kpis.outbound)} note={`${fmtInt(data.kpis.outboundConnected)} connected`} />
            <Kpi label="Talk time" value={mins(data.kpis.talkMinutes)} note={`Avg ${data.kpis.avgTalkSec}s per connected call`} />
          </section>

          {property === 'ALL' && (
            <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
              <h2 className="border-b border-line p-4 font-medium">By property</h2>
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs text-muted">
                  <tr>
                    <th className="p-3">Property</th>
                    <th className="p-3 text-right">Leads</th>
                    <th className="p-3 text-right">Incoming answered</th>
                    <th className="p-3 text-right">Missed</th>
                    <th className="p-3 text-right">Missed %</th>
                    <th className="p-3 text-right">Outgoing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {data.byProperty.map((p) => (
                    <tr key={p.code} className={p.code === 'UNASSIGNED' ? 'text-muted' : ''}>
                      <td className="p-3">
                        <Link href={href({ property: p.code })} className="hover:underline">{p.name}</Link>
                      </td>
                      <td className="p-3 text-right font-medium">{fmtInt(p.leads)}</td>
                      <td className="p-3 text-right">{fmtInt(p.inbound)}</td>
                      <td className="p-3 text-right">{fmtInt(p.missed)}</td>
                      <td className="p-3 text-right">{share(p.missed, p.inbound + p.missed)}</td>
                      <td className="p-3 text-right">{fmtInt(p.outbound)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Leads by source</h2>
              <Bars rows={data.leadsBySource} label="source" value="leads" />
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Leads by status</h2>
              <Bars rows={data.leadsByStatus} label="status" value="leads" />
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Leads by ad offer</h2>
              <Bars rows={data.leadsByOffer.map((o) => ({ ...o, offer: o.offer.replace(/_/g, ' ') }))} label="offer" value="leads" />
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Incoming calls by hour (IST)</h2>
              <HourBars rows={data.callsByHour} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-card">
              <h2 className="border-b border-line p-4 font-medium">Calls by staff</h2>
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs text-muted">
                  <tr>
                    <th className="p-3">Staff</th>
                    <th className="p-3 text-right">Incoming</th>
                    <th className="p-3 text-right">Missed</th>
                    <th className="p-3 text-right">Outgoing</th>
                    <th className="p-3 text-right">Talk time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {data.callsByStaff.map((s) => (
                    <tr key={s.staff}>
                      <td className="p-3">{s.staff}</td>
                      <td className="p-3 text-right">{fmtInt(s.inbound)}</td>
                      <td className="p-3 text-right">{fmtInt(s.missed)}</td>
                      <td className="p-3 text-right">{fmtInt(s.outbound)}</td>
                      <td className="p-3 text-right">{mins(s.talkMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2 className="border-y border-line p-4 font-medium">Leads by staff</h2>
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs text-muted">
                  <tr>
                    <th className="p-3">Staff</th>
                    <th className="p-3 text-right">Leads</th>
                    <th className="p-3 text-right">Interested</th>
                    <th className="p-3 text-right">Purchased</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {data.leadsByStaff.map((s) => (
                    <tr key={s.staff}>
                      <td className="p-3">{s.staff}</td>
                      <td className="p-3 text-right">{fmtInt(s.leads)}</td>
                      <td className="p-3 text-right">{fmtInt(s.interested)}</td>
                      <td className="p-3 text-right">{fmtInt(s.purchased)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
            <h2 className="border-b border-line p-4 font-medium">Daily</h2>
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Leads</th>
                  <th className="p-3 text-right">Facebook</th>
                  <th className="p-3 text-right">Phone</th>
                  <th className="p-3 text-right">Incoming answered</th>
                  <th className="p-3 text-right">Missed</th>
                  <th className="p-3 text-right">Outgoing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="p-3">{d.date}</td>
                    <td className="p-3 text-right font-medium">{fmtInt(d.leads)}</td>
                    <td className="p-3 text-right">{fmtInt(d.facebook)}</td>
                    <td className="p-3 text-right">{fmtInt(d.phone)}</td>
                    <td className="p-3 text-right">{fmtInt(d.inbound)}</td>
                    <td className="p-3 text-right">{fmtInt(d.missed)}</td>
                    <td className="p-3 text-right">{fmtInt(d.outbound)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
            <h2 className="border-b border-line p-4 font-medium">VGP phone lines</h2>
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="p-3">Number</th>
                  <th className="p-3">Property</th>
                  <th className="p-3 text-right">Incoming answered</th>
                  <th className="p-3 text-right">Missed</th>
                  <th className="p-3 text-right">Outgoing</th>
                  <th className="p-3 text-right">Leads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {data.lines.map((l) => (
                  <tr key={l.number}>
                    <td className="p-3">{fmtLine(l.number)}{l.label ? <span className="ml-2 text-xs text-muted">{l.label}</span> : null}</td>
                    <td className="p-3">
                      {l.propertyCode ? data.propertyNames[l.propertyCode] ?? l.propertyCode : <span className="text-amber-700 dark:text-amber-400">Not mapped yet</span>}
                    </td>
                    <td className="p-3 text-right">{fmtInt(l.inbound)}</td>
                    <td className="p-3 text-right">{fmtInt(l.missed)}</td>
                    <td className="p-3 text-right">{fmtInt(l.outbound)}</td>
                    <td className="p-3 text-right">{fmtInt(l.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
