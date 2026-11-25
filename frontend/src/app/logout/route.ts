import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/api';

/**
 * Sign out: clear the session cookie and go to the login page.
 * The redirect is relative ("/login") so it always stays on the domain the user is on -
 * behind Dokploy the server itself only knows its internal address (0.0.0.0:3000).
 */
export async function GET() {
  const res = new NextResponse(null, { status: 303, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
