import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';
import { SHARED_COOKIE_PREFIX } from '@/lib/shared-session';
import { APP_URL } from '@/lib/apps';

export const runtime = 'nodejs';

// Signing out here signs the person out everywhere, which is what one
// sign-in ought to mean. Clearing only the EduPage cookie would send them
// straight back in on the next request, since the POS session would still be
// sitting there for the middleware to adopt.
export async function POST() {
  const res = NextResponse.json({ ok: true, redirect: `${APP_URL.pos}/login` });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });

  const dead = {
    path: '/',
    maxAge: 0,
    domain: '.edubabyhouse.store',
    sameSite: 'lax' as const,
    secure: true,
  };
  res.cookies.set(SHARED_COOKIE_PREFIX, '', dead);
  for (let i = 0; i < 20; i++) res.cookies.set(`${SHARED_COOKIE_PREFIX}.${i}`, '', dead);
  return res;
}
