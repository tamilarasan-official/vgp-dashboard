import { NextResponse, type NextRequest } from 'next/server';

/** Every page needs a session cookie; the backend validates the token on each data request. */
export function middleware(req: NextRequest) {
  if (!req.cookies.get('vgp_session')?.value) {
    // nextUrl is built from the request's Host header, so this stays on the user's domain.
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico|vgp-logo.svg).*)'],
};
