import { Injectable } from '@nestjs/common';

/**
 * Read-only Zoho CRM client (India DC). Uses a Self Client refresh token with READ scopes only.
 * Only GET requests and COQL (a read-only query API) are used.
 */
@Injectable()
export class ZohoClient {
  private token: { value: string; expires: number } | null = null;

  private get cfg() {
    return {
      accounts: (process.env.ZOHO_ACCOUNTS_URL ?? 'https://accounts.zoho.in').replace(/\/$/, ''),
      api: (process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.in').replace(/\/$/, ''),
      clientId: process.env.ZOHO_CLIENT_ID ?? '',
      clientSecret: process.env.ZOHO_CLIENT_SECRET ?? '',
      refreshToken: process.env.ZOHO_REFRESH_TOKEN ?? '',
    };
  }

  isConfigured() {
    const c = this.cfg;
    return Boolean(c.clientId && c.clientSecret && c.refreshToken);
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expires) return this.token.value;
    const c = this.cfg;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
    });
    const res = await fetch(`${c.accounts}/oauth/v2/token`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!data.access_token) throw new Error(`Zoho token refresh failed: ${data.error ?? res.status}`);
    this.token = { value: data.access_token, expires: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000 };
    return data.access_token;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`${this.cfg.api}/crm/v8${path}`, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${await this.accessToken()}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 204) return null; // no records
      const text = await res.text();
      if (res.status === 401 && attempt < 3) {
        this.token = null;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 5000));
        continue;
      }
      if (!res.ok) {
        let detail = '';
        try {
          const j = JSON.parse(text);
          detail = `${j.code ?? ''} ${j.message ?? ''}`.trim();
        } catch {
          /* ignore */
        }
        throw new Error(`Zoho ${method} ${path.split('?')[0]} -> HTTP ${res.status} ${detail}`);
      }
      return (text ? JSON.parse(text) : null) as T;
    }
    throw new Error('Zoho request failed after retries');
  }

  /** COQL select (read-only). Returns [] when nothing matches. */
  async coql<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const r = await this.call<{ data?: T[] }>('POST', '/coql', { select_query: query });
    return r?.data ?? [];
  }

  async get<T>(path: string): Promise<T | null> {
    return this.call<T>('GET', path);
  }
}
