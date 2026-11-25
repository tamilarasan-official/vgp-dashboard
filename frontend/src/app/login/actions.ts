'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, SESSION_COOKIE } from '@/lib/api';

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'Server is not reachable. Please try again.' };
  }
  const data = (await res.json().catch(() => ({}))) as { token?: string; expiresAt?: string; message?: string };
  if (!res.ok || !data.token) return { error: data.message ?? 'Wrong email or password.' };

  const proto = (await headers()).get('x-forwarded-proto');
  (await cookies()).set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto === 'https' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
    path: '/',
    expires: data.expiresAt ? new Date(data.expiresAt) : undefined,
  });
  redirect('/');
}
