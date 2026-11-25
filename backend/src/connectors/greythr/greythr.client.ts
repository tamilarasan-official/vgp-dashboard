import { Injectable } from '@nestjs/common';

/**
 * Read-only greytHR client. Token from https://<domain>/uas/v1/oauth2/client-token (Basic auth, ~45 days),
 * then GET calls to https://api.greythr.com with ACCESS-TOKEN + x-greythr-domain headers.
 */
@Injectable()
export class GreythrClient {
  private token: { value: string; expires: number } | null = null;

  private get cfg() {
    return {
      domain: process.env.GREYTHR_DOMAIN ?? '',
      user: process.env.GREYTHR_API_USER ?? '',
      password: process.env.GREYTHR_API_PASSWORD ?? '',
    };
  }

  isConfigured() {
    const c = this.cfg;
    return Boolean(c.domain && c.user && c.password);
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expires) return this.token.value;
    const c = this.cfg;
    const res = await fetch(`https://${c.domain}/uas/v1/oauth2/client-token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`, 'Content-Length': '0' },
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error(`greytHR login failed: HTTP ${res.status}`);
    // Renew a day early.
    this.token = { value: data.access_token, expires: Date.now() + Math.max(3600, (data.expires_in ?? 86400) - 86400) * 1000 };
    return data.access_token;
  }

  async get<T>(path: string): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://api.greythr.com${path}`, {
        headers: { 'ACCESS-TOKEN': await this.accessToken(), 'x-greythr-domain': this.cfg.domain },
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 401 && attempt < 3) {
        this.token = null;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 5000));
        continue;
      }
      if (!res.ok) throw new Error(`greytHR GET ${path.split('?')[0]} -> HTTP ${res.status}`);
      return (await res.json()) as T;
    }
    throw new Error('greytHR request failed after retries');
  }

  /** Fetch every page of a paged endpoint ({ data: [], pages: { hasNext } }). */
  async all<T>(path: string, size = 2000): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < 100; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const r = await this.get<{ data?: T[]; pages?: { hasNext?: boolean } }>(`${path}${sep}page=${page}&size=${size}`);
      out.push(...(r.data ?? []));
      if (!r.pages?.hasNext) break;
    }
    return out;
  }
}
