import Link from 'next/link';
import { apiGet, fmtDateTime, fmtInt } from '@/lib/api';

type Summary = {
  range: { from: string; to: string };
  group: string;
  groupNames: Record<string, string>;
  lastSyncedAt: string | null;
  kpis: {
    activeEmployees: number;
    employeesInPeriod: number;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    attendanceRate: number;
    lateIns: number;
    earlyOuts: number;
    avgInTime: string | null;
    avgWorkHours: number | null;
    joiners: number;
    leavers: number;
  };
  snapshot: { date: string; employees?: number; present?: number; absent?: number; off?: number; leave?: number; unmarked?: number; late?: number };
  byGroup: { code: string; name: string; employees: number; present: number; absent: number; leave: number; late: number; rate: number }[];
  byShift: { shift: string; group: string; employees: number; rate: number; absent: number; late: number; avgInTime: string | null }[];
  daily: { date: string; employees: number; present: number; absent: number; off: number; leave: number; unmarked: number; late: number }[];
  inTimes: { hour: number; punches: number }[];
  monthly: { month: string; joiners: number; leavers: number; headcount: number }[];
};

const GROUPS = [
  { code: 'ALL', label: 'All staff' },
  { code: 'WW', label: 'Wonder World' },
  { code: 'IR', label: 'Ice Rink' },
  { code: 'FLY', label: 'Fly Dining' },
  { code: 'VEL', label: 'Velocity' },
  { code: 'COMMON', label: 'Common' },
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
const days = (v: number) => fmtInt(Math.round(v * 10) / 10);

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'warn' | 'good' }) {
  const color = tone === 'warn' ? 'text-rose-600 dark:text-rose-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : '';
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
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

export default async function HrPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const sp = await searchParams;
  const yesterday = addDays(istToday(), -1);
  const to = sp.to ?? yesterday;
  const from = sp.from ?? addDays(to, -6);
  const group = GROUPS.some((g) => g.code === sp.group) ? sp.group! : 'ALL';
  const data = await apiGet<Summary>(`/greythr/summary?from=${from}&to=${to}&group=${group}`);
  const href = (q: { from?: string; to?: string; group?: string }) => {
    const p = { from, to, group, ...q };
    return `/hr?from=${p.from}&to=${p.to}${p.group !== 'ALL' ? `&group=${p.group}` : ''}`;
  };
  const presets = [
    { label: 'Yesterday', from: yesterday, to: yesterday },
    { label: 'Today (so far)', from: istToday(), to: istToday() },
    { label: '7 days', from: addDays(yesterday, -6), to: yesterday },
    { label: '30 days', from: addDays(yesterday, -29), to: yesterday },
  ];
  const s = data?.snapshot;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">HR &amp; Attendance</h1>
          <p className="text-sm text-muted">
            Source: greytHR · {from} to {to} · last synced {fmtDateTime(data?.lastSyncedAt ?? null)}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {presets.map((p) => (
            <Link key={p.label} href={href({ from: p.from, to: p.to })} className="rounded border border-line bg-card px-3 py-1 hover:bg-subtle">
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {GROUPS.map((g) => (
          <Link
            key={g.code}
            href={href({ group: g.code })}
            className={`rounded-full border px-3 py-1 ${group === g.code ? 'border-accent bg-accent text-white' : 'border-line bg-card hover:bg-subtle'}`}
          >
            {g.label}
          </Link>
        ))}
      </nav>

      {!data ? (
        <p className="mt-6 rounded border border-rose-300 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">Could not load data from the backend.</p>
      ) : (
        <>

          <h2 className="mt-6 text-sm font-medium text-muted">On {s?.date}</h2>
          <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-6">
            <Kpi label="Staff on roll" value={fmtInt(s?.employees ?? 0)} />
            <Kpi label="Present" value={fmtInt(s?.present ?? 0)} tone="good" />
            <Kpi label="Absent" value={fmtInt(s?.absent ?? 0)} tone={(s?.absent ?? 0) > 0 ? 'warn' : undefined} />
            <Kpi label="Week off / holiday" value={fmtInt(s?.off ?? 0)} />
            <Kpi label="On leave" value={fmtInt(s?.leave ?? 0)} />
            <Kpi label="Late in" value={fmtInt(s?.late ?? 0)} note={s?.unmarked ? `${fmtInt(s.unmarked)} not marked yet` : undefined} />
          </section>

          <h2 className="mt-6 text-sm font-medium text-muted">Period {from} to {to}</h2>
          <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Attendance rate" value={pct(data.kpis.attendanceRate)} note="Present ÷ (present + absent + leave)" tone={data.kpis.attendanceRate < 0.85 ? 'warn' : 'good'} />
            <Kpi label="Absent days" value={days(data.kpis.absentDays)} note={`${days(data.kpis.leaveDays)} leave days`} />
            <Kpi label="Late arrivals" value={fmtInt(data.kpis.lateIns)} note={`${fmtInt(data.kpis.earlyOuts)} early exits`} />
            <Kpi label="Avg in-time · hours" value={`${data.kpis.avgInTime ?? '–'} · ${data.kpis.avgWorkHours ?? '–'}h`} note="On full present days" />
            <Kpi label="Active employees" value={fmtInt(data.kpis.activeEmployees)} note="All of VGP Promoters in greytHR" />
            <Kpi label="Joined" value={fmtInt(data.kpis.joiners)} />
            <Kpi label="Left" value={fmtInt(data.kpis.leavers)} tone={data.kpis.leavers > data.kpis.joiners ? 'warn' : undefined} />
            <Kpi label="Present days" value={days(data.kpis.presentDays)} />
          </section>

          {group === 'ALL' && (
            <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
              <h2 className="border-b border-line p-4 font-medium">By area</h2>
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs text-muted">
                  <tr>
                    <th className="p-3">Group</th>
                    <th className="p-3 text-right">Staff</th>
                    <th className="p-3 text-right">Attendance</th>
                    <th className="p-3 text-right">Absent days</th>
                    <th className="p-3 text-right">Leave days</th>
                    <th className="p-3 text-right">Late</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {data.byGroup.map((g) => (
                    <tr key={g.code}>
                      <td className="p-3"><Link href={href({ group: g.code })} className="hover:underline">{g.name}</Link></td>
                      <td className="p-3 text-right font-medium">{fmtInt(g.employees)}</td>
                      <td className="p-3 text-right">{g.employees ? pct(g.rate) : '–'}</td>
                      <td className="p-3 text-right">{days(g.absent)}</td>
                      <td className="p-3 text-right">{days(g.leave)}</td>
                      <td className="p-3 text-right">{fmtInt(g.late)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">First punch-in time</h2>
              <Bars rows={data.inTimes.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour).padStart(2, '0')}:59` }))} label="label" value="punches" />
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-card">
              <h2 className="border-b border-line p-4 font-medium">Joiners &amp; leavers (12 months)</h2>
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs text-muted">
                  <tr>
                    <th className="p-3">Month</th>
                    <th className="p-3 text-right">Headcount (month end)</th>
                    <th className="p-3 text-right">Joined</th>
                    <th className="p-3 text-right">Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {[...data.monthly].reverse().map((m) => (
                    <tr key={m.month}>
                      <td className="p-3">{m.month}</td>
                      <td className="p-3 text-right font-medium">{fmtInt(m.headcount)}</td>
                      <td className="p-3 text-right">{fmtInt(m.joiners)}</td>
                      <td className="p-3 text-right">{fmtInt(m.leavers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
            <h2 className="border-b border-line p-4 font-medium">By shift</h2>
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="p-3">Shift</th>
                  <th className="p-3">Group</th>
                  <th className="p-3 text-right">Staff</th>
                  <th className="p-3 text-right">Attendance</th>
                  <th className="p-3 text-right">Absent days</th>
                  <th className="p-3 text-right">Late</th>
                  <th className="p-3 text-right">Avg in-time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {data.byShift.map((r) => (
                  <tr key={r.shift}>
                    <td className="p-3">{r.shift}</td>
                    <td className="p-3 text-muted">{data.groupNames[r.group]?.split(' (')[0] ?? r.group}</td>
                    <td className="p-3 text-right">{fmtInt(r.employees)}</td>
                    <td className="p-3 text-right">{pct(r.rate)}</td>
                    <td className="p-3 text-right">{days(r.absent)}</td>
                    <td className="p-3 text-right">{fmtInt(r.late)}</td>
                    <td className="p-3 text-right">{r.avgInTime ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
            <h2 className="border-b border-line p-4 font-medium">Daily</h2>
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">On roll</th>
                  <th className="p-3 text-right">Present</th>
                  <th className="p-3 text-right">Absent</th>
                  <th className="p-3 text-right">Week off</th>
                  <th className="p-3 text-right">Leave</th>
                  <th className="p-3 text-right">Late</th>
                  <th className="p-3 text-right">Not marked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="p-3">{d.date}</td>
                    <td className="p-3 text-right">{fmtInt(d.employees)}</td>
                    <td className="p-3 text-right font-medium">{fmtInt(d.present)}</td>
                    <td className="p-3 text-right">{fmtInt(d.absent)}</td>
                    <td className="p-3 text-right">{fmtInt(d.off)}</td>
                    <td className="p-3 text-right">{fmtInt(d.leave)}</td>
                    <td className="p-3 text-right">{fmtInt(d.late)}</td>
                    <td className="p-3 text-right text-muted">{fmtInt(d.unmarked)}</td>
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
