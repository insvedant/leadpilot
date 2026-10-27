import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'lp_session';

export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard') && !signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if ((pathname === '/login' || pathname === '/register') && signedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/login', '/register'] };
