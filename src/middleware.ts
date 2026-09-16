import { NextRequest, NextResponse } from 'next/server';
import { verifySession, canOpen, SESSION_COOKIE } from '@/lib/session';
import { hasSharedSession } from '@/lib/shared-session';
import { APP_URL } from '@/lib/apps';

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const here = new URL(req.nextUrl.pathname + req.nextUrl.search, APP_URL.onlineorder);

    // Arriving with a POS sign-in: trade it for an EduPage session. Checking
    // the token takes a Supabase call, which this edge middleware can't make,
    // so that happens once in /api/auth/adopt.
    if (hasSharedSession(req.cookies)) {
      const url = req.nextUrl.clone();
      url.pathname = '/api/auth/adopt';
      url.search = `?next=${encodeURIComponent(here.toString())}`;
      return NextResponse.redirect(url);
    }

    // Not signed in anywhere. The POS owns the sign-in screen for all four
    // apps and will send them back here afterwards.
    return NextResponse.redirect(
      `${APP_URL.pos}/login?next=${encodeURIComponent(here.toString())}`
    );
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
    '/((?!api/webhook|api/cron|api/auth|api/lang|login|no-access|privacy|_next|favicon.ico).*)',
  ],
};
