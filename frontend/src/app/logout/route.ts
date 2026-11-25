import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/api';

export async function GET(req: NextRequest) {
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL('/login', req.url));
}
