import { NextRequest, NextResponse } from 'next/server';
import { verifySession, canOpen, SESSION_COOKIE } from '@/lib/session';

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = req.nextUrl.pathname === '/'
      ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  // An agent who types a manager URL lands back on their own inbox rather
  // than seeing an error they can do nothing about.
  if (!canOpen(session.role, req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/inbox';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/webhook|api/cron|api/auth|api/lang|login|privacy|_next|favicon.ico).*)',
  ],
};
