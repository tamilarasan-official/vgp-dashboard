import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, fmtDateTime, fmtINR, fmtInt, getMe } from '@/lib/api';

type Fs = { lastSyncedAt: string | null; kpis: { grandTotal: number; cardCollection: number; directSale: number; cardsIssued: number; gamePlays: number } };
type Zoho = {
  lastSyncedAt: string | null;
  kpis: { leads: number; interested: number; inbound: number; missed: number; outbound: number; missedRate: number };
  byProperty: { code: string; name: string; leads: number; inbound: number; missed: number }[];
};
type Hr = {
  lastSyncedAt: string | null;
  kpis: { activeEmployees: number; attendanceRate: number; lateIns: number; joiners: number; leavers: number };
  snapshot: { date: string; employees?: number; present?: number; absent?: number; off?: number; leave?: number };
};
type UploadRow = { uploadedAt: string; fileName: string; reportType: string; uploadedBy: { name: string } };
type Health = { sources: { code: string; name: string; status: string }[] };

function istToday() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const monthName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'good' }) {
  const color = tone === 'warn' ? 'text-rose-600 dark:text-rose-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : '';
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Card({ title, href, synced, children }: { title: string; href: string; synced: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted">{synced}</p>
        </div>
        <Link href={href} className="text-sm text-accent hover:underline">Details →</Link>
      </div>
      {children}
    </section>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  access_confirmed: { label: 'In progress', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  pending: { label: 'In progress', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  blocked: { label: 'In progress', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
};

export default async function OverviewPage() {
  const me = await getMe();
  if (me?.role === 'tally_uploader') redirect('/tally');
  if (me?.role === 'feedback_uploader') redirect('/feedback');

  const today = istToday();
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 8)}01`;

  const [fsToday, fsMonth, zToday, zMonth, hrDay, hrMonth, tally, feedback, health] = await Promise.all([
    apiGet<Fs>(`/funsquare/summary?from=${today}&to=${today}`),
    apiGet<Fs>(`/funsquare/summary?from=${monthStart}&to=${today}`),
    apiGet<Zoho>(`/zoho/summary?from=${today}&to=${today}`),
    apiGet<Zoho>(`/zoho/summary?from=${monthStart}&to=${today}`),
    apiGet<Hr>(`/greythr/summary?from=${yesterday}&to=${yesterday}`),
    apiGet<Hr>(`/greythr/summary?from=${monthStart <= yesterday ? monthStart : yesterday}&to=${yesterday}`),
    apiGet<UploadRow[]>('/uploads/tally'),
    apiGet<UploadRow[]>('/uploads/thoughtmetrics'),
    apiGet<Health>('/health'),
  ]);
  const month = monthName(today);
  const snap = hrDay?.snapshot;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Good {Number(new Date(Date.now() + 330 * 60_000).toISOString().slice(11, 13)) < 12 ? 'morning' : 'day'}, {me?.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted">
          {new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} · figures in IST
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Velocity – collections" href="/velocity" synced={`Updated ${fmtDateTime(fsMonth?.lastSyncedAt ?? null)}`}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Today" value={fmtINR(fsToday?.kpis.grandTotal ?? 0)} sub={`${fmtInt(fsToday?.kpis.gamePlays ?? 0)} game plays`} />
            <Stat label={`${month} so far`} value={fmtINR(fsMonth?.kpis.grandTotal ?? 0)} sub={`${fmtInt(fsMonth?.kpis.gamePlays ?? 0)} game plays`} />
            <Stat label={`Cards issued (${month})`} value={fmtInt(fsMonth?.kpis.cardsIssued ?? 0)} />
          </div>
        </Card>

        <Card title="Leads & calls" href="/crm" synced={`Updated ${fmtDateTime(zMonth?.lastSyncedAt ?? null)}`}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="New leads today" value={fmtInt(zToday?.kpis.leads ?? 0)} sub={`${fmtInt(zMonth?.kpis.leads ?? 0)} in ${month}`} />
            <Stat label={`Interested (${month})`} value={fmtInt(zMonth?.kpis.interested ?? 0)} />
            <Stat
              label={`Missed calls (${month})`}
              value={fmtInt(zMonth?.kpis.missed ?? 0)}
              sub={`${pct(zMonth?.kpis.missedRate ?? 0)} of incoming`}
              tone={(zMonth?.kpis.missedRate ?? 0) >= 0.3 ? 'warn' : undefined}
            />
          </div>
          {zMonth && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-muted">
              {zMonth.byProperty.filter((p) => p.code !== 'UNASSIGNED').map((p) => (
                <span key={p.code}>
                  {p.name.replace('VGP ', '')}: <b className="text-foreground">{fmtInt(p.leads)}</b> leads
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card title="Staff attendance" href="/hr" synced={`Updated ${fmtDateTime(hrDay?.lastSyncedAt ?? null)}`}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Present yesterday" value={`${fmtInt(snap?.present ?? 0)} / ${fmtInt(snap?.employees ?? 0)}`} tone="good" />
            <Stat label="Absent yesterday" value={fmtInt(snap?.absent ?? 0)} tone={(snap?.absent ?? 0) > 0 ? 'warn' : undefined} />
            <Stat label={`Attendance (${month})`} value={pct(hrMonth?.kpis.attendanceRate ?? 0)} />
            <Stat label="Active staff" value={fmtInt(hrMonth?.kpis.activeEmployees ?? 0)} sub={`+${hrMonth?.kpis.joiners ?? 0} joined · ${hrMonth?.kpis.leavers ?? 0} left`} />
          </div>
        </Card>

        <Card title="Accounts & customer feedback" href="/tally" synced="Uploaded by VGP teams">
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Tally – last upload"
              value={tally?.[0] ? fmtDateTime(tally[0].uploadedAt) : 'Awaiting first upload'}
              sub={tally?.[0] ? `by ${tally[0].uploadedBy.name}` : 'Accounts team uploads daily'}
            />
            <Stat
              label="Feedback – last upload"
              value={feedback?.[0] ? fmtDateTime(feedback[0].uploadedAt) : 'Awaiting first upload'}
              sub={feedback?.[0] ? `by ${feedback[0].uploadedBy.name}` : 'Thought Metrics reports'}
            />
          </div>
        </Card>
      </div>

      {health && (
        <section className="mt-6 rounded-xl border border-line bg-card p-5">
          <h2 className="mb-3 font-semibold">Data sources</h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {health.sources.map((s) => {
              const st = STATUS[s.status] ?? STATUS.pending;
              return (
                <li key={s.code} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2">
                  <span className="truncate">{s.name.split(' (')[0]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
