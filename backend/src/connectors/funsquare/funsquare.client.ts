import { Injectable, Logger } from '@nestjs/common';

/** Raw record shapes returned by FunSquare Cloud (only fields we use). */
export interface FsPaymentRecord {
  payment_id: number;
  payment_mode: string;
  pre_amount: number;
  recharge_amount: number;
  discount_amount: number;
  collect_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  main_amount: number;
  bonus_amount: number;
  post_amount: number;
  user?: string;
  date: string;
}
export interface FsBillingRecord {
  billing_id: number;
  game: string;
  pre_amount: number;
  paid_amount: number;
  post_amount: number;
  date: string;
}
export interface FsPunchLog {
  id: string;
  log_game?: string;
  amount: string;
  created_at: string;
}

/**
 * Thin read-only client for FunSquare Cloud (Elesoft).
 * - Login: JSON body + Basic app key + `domain` header -> bearer token (~24 h).
 * - Data calls: POST form data (date_from / date_to). JSON bodies are ignored by the API.
 * - An expired token makes the server return HTTP 500, so we refresh the token early.
 */
@Injectable()
export class FunsquareClient {
  private readonly logger = new Logger(FunsquareClient.name);
  private token: string | null = null;
  private tokenAt = 0;
  private static readonly TOKEN_MAX_AGE_MS = 20 * 60 * 60 * 1000; // refresh after 20 h (expires ~24 h)

  private get baseUrl() {
    return process.env.FUNSQUARE_BASE_URL ?? 'https://funsquare-cloud-api.elesof.com/app/v1';
  }
  private get domain() {
    return process.env.FUNSQUARE_DOMAIN ?? '';
  }

  isConfigured(): boolean {
    return !!(process.env.FUNSQUARE_DOMAIN && process.env.FUNSQUARE_USERNAME && process.env.FUNSQUARE_PASSWORD);
  }

  private async login(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        domain: this.domain,
        'Content-Type': 'application/json',
        Authorization: `Basic ${process.env.FUNSQUARE_APP_BASIC ?? ''}`,
      },
      body: JSON.stringify({ username: process.env.FUNSQUARE_USERNAME, password: process.env.FUNSQUARE_PASSWORD }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: { token?: string } };
    if (!res.ok || !body.success || !body.data?.token) {
      throw new Error(`FunSquare login failed (HTTP ${res.status}): ${body.message ?? 'no message'}`);
    }
    this.token = body.data.token;
    this.tokenAt = Date.now();
    this.logger.log('Logged in to FunSquare');
    return this.token;
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() - this.tokenAt < FunsquareClient.TOKEN_MAX_AGE_MS) return this.token;
    return this.login();
  }

  /** POST a date-range report. Retries once with a fresh token on auth/server errors. */
  async report<T = unknown>(endpoint: string, dateFrom: string, dateTo: string): Promise<T> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const token = await this.getToken();
      const res = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { domain: this.domain, Authorization: `Bearer ${token}` },
        body: new URLSearchParams({ date_from: dateFrom, date_to: dateTo }),
        signal: AbortSignal.timeout(120_000),
      });
      const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string; data?: T } | null;
      if (res.ok && body?.success) return body.data as T;
      if (attempt === 1 && (res.status === 401 || res.status === 403 || res.status === 500)) {
        this.token = null; // force re-login and retry once
        continue;
      }
      throw new Error(`FunSquare ${endpoint} failed (HTTP ${res.status}): ${body?.message ?? 'no message'}`);
    }
    throw new Error(`FunSquare ${endpoint} failed after retry`);
  }
}
