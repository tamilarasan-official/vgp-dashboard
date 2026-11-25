import Link from 'next/link';
import { apiGet, fmtDateTime, fmtINR, fmtInt } from '@/lib/api';

type Summary = {
  property: { code: string; name: string };
  range: { from: string; to: string };
  lastSyncedAt: string | null;
  kpis: {
    grandTotal: number;
    cardCollection: number;
    directSale: number;
    cardsIssued: number;
    recharges: number;
    rechargeCollected: number;
    taxable: number;
    gst: number;
    bonusCredits: number;
    gamePlays: number;
    gamePlayValue: number;
  };
  daily: { date: string; grandTotal: number; cardCollection: number; directSale: number; cardsIssued: number; gamePlays: number }[];
  byPaymentMode: { mode: string; count: number; amount: number }[];
  byCashier: { cashier: string; count: number; amount: number }[];
  byGame: { game: string; plays: number; amount: number }[];
  byHour: { hour: number; plays: number; amount: number }[];
};

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
];

function istToday() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

function Bars({ rows, label, value, format }: { rows: Record<string, unknown>[]; label: string; value: string; format: (v: number) => string }) {
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

export default async function VelocityPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const to = sp.to ?? istToday();
  const from = sp.from ?? addDays(to, -6);
  const data = await apiGet<Summary>(`/funsquare/summary?from=${from}&to=${to}`);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Velocity</h1>
          <p className="text-sm text-muted">
            Source: FunSquare · {from} to {to} · last synced {fmtDateTime(data?.lastSyncedAt ?? null)}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          {PRESETS.map((p) => {
            const t = istToday();
            return (
              <Link key={p.label} href={`/velocity?from=${addDays(t, -p.days)}&to=${t}`} className="rounded border border-line bg-card px-3 py-1 hover:bg-subtle">
                {p.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {!data ? (
        <p className="mt-6 rounded border border-rose-300 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">Could not load data from the backend.</p>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total collection" value={fmtINR(data.kpis.grandTotal)} note="Card recharges + direct sales" />
            <Kpi label="Card recharges" value={fmtINR(data.kpis.cardCollection)} note={`${fmtInt(data.kpis.recharges)} recharges · GST ${fmtINR(data.kpis.gst)}`} />
            <Kpi label="Direct sales" value={fmtINR(data.kpis.directSale)} />
            <Kpi label="Cards issued" value={fmtInt(data.kpis.cardsIssued)} />
            <Kpi label="Game plays" value={fmtInt(data.kpis.gamePlays)} />
            <Kpi label="Value played" value={fmtINR(data.kpis.gamePlayValue)} note="Credits used on games" />
            <Kpi label="Bonus credits given" value={fmtINR(data.kpis.bonusCredits)} />
            <Kpi label="Taxable value" value={fmtINR(data.kpis.taxable)} />
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Revenue by game</h2>
              <Bars rows={data.byGame} label="game" value="amount" format={fmtINR} />
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Recharges by payment mode</h2>
              <Bars rows={data.byPaymentMode} label="mode" value="amount" format={fmtINR} />
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 font-medium">Game plays by hour (IST)</h2>
              <Bars rows={data.byHour.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))} label="label" value="plays" format={fmtInt} />
            </div>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
            <h2 className="border-b border-line p-4 font-medium">Daily</h2>
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Card recharges</th>
                  <th className="p-3 text-right">Direct sales</th>
                  <th className="p-3 text-right">Cards issued</th>
                  <th className="p-3 text-right">Game plays</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="p-3">{d.date}</td>
                    <td className="p-3 text-right font-medium">{fmtINR(d.grandTotal)}</td>
                    <td className="p-3 text-right">{fmtINR(d.cardCollection)}</td>
                    <td className="p-3 text-right">{fmtINR(d.directSale)}</td>
                    <td className="p-3 text-right">{fmtInt(d.cardsIssued)}</td>
                    <td className="p-3 text-right">{fmtInt(d.gamePlays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 rounded-lg border border-line bg-card p-4">
            <h2 className="mb-3 font-medium">Recharges by cashier</h2>
            <Bars rows={data.byCashier} label="cashier" value="amount" format={fmtINR} />
          </section>
        </>
      )}
    </main>
  );
}
