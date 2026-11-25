/** Date helpers. VGP business dates are in IST (UTC+05:30). */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Today's business date in IST as YYYY-MM-DD. */
export function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Add days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every date from `from` to `to` inclusive (YYYY-MM-DD). */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "2026-11-01 22:15:06" (IST local) -> Date. */
export function parseIstDateTime(value: string): Date {
  return new Date(`${value.trim().replace(' ', 'T')}+05:30`);
}

/** YYYY-MM-DD -> Date for a Postgres DATE column. */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
