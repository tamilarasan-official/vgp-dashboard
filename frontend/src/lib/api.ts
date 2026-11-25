import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/** Backend base URL (server side only; in Docker this is the internal service address). */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';
export const SESSION_COOKIE = 'vgp_session';

export type Me = { id: number; email: string; name: string; role: 'admin' | 'viewer' | 'tally_uploader' | 'feedback_uploader' };

async function authHeader(): Promise<Record<string, string>> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET from the backend with the user's session. Redirects to /login when the session is missing or expired. */
export async function apiGet<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: await authHeader() });
  } catch {
    return null;
  }
  if (res.status === 401) redirect('/login');
  return res.ok ? ((await res.json()) as T) : null;
}

export async function apiSend<T>(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | { message?: string } }> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    cache: 'no-store',
    headers: { ...(await authHeader()), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) redirect('/login');
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function getMe(): Promise<Me | null> {
  return apiGet<Me>('/auth/me');
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('en-IN');

export const fmtINR = (v: number) => inr.format(v);
export const fmtInt = (v: number) => int.format(v);
export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'never';
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '–';
