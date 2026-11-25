import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/api';

/** Download an uploaded file through the backend (session required). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API_URL}/uploads/file/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
  if (!res.ok) return new NextResponse('Not available', { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment',
    },
  });
}
