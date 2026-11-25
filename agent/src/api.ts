/** Pushes data to the VGP dashboard API (outbound HTTPS only). */
export class DashboardApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(180_000),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`API ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
        return (text ? JSON.parse(text) : {}) as T;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, attempt * 3000));
      }
    }
    throw new Error('unreachable');
  }

  state(company: string) {
    return this.call<{ known: boolean; lastAlterId: number; lastMasterSync: string | null; lastFullCheck: string | null }>(
      'GET',
      `/ingest/tally/state?company=${encodeURIComponent(company)}`,
    );
  }
  masters(body: unknown) {
    return this.call<{ groups: number; ledgers: number }>('POST', '/ingest/tally/masters', body);
  }
  vouchers(body: unknown) {
    return this.call<{ vouchers: number; lines: number; lastAlterId: number }>('POST', '/ingest/tally/vouchers', body);
  }
  guidCheck(body: unknown) {
    return this.call<{ checked: number; markedDeleted: number; restored: number }>('POST', '/ingest/tally/guid-check', body);
  }
  heartbeat(body: unknown) {
    return this.call('POST', '/ingest/tally/heartbeat', body);
  }
}
