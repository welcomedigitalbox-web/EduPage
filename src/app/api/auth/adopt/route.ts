import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { signSession, SESSION_COOKIE, SESSION_DAYS, type Role } from '@/lib/session';
import { sharedAccessToken } from '@/lib/shared-session';
import { APP_URL, safeNext } from '@/lib/apps';

export const runtime = 'nodejs';

// Turns the POS sign-in into an EduPage session.
//
// The middleware sends people here once, when they arrive with a POS session
// but no EduPage one. Verifying the token needs a Supabase round-trip, which
// the edge middleware can't do on every request — so it happens here, and the
// short-lived signed cookie carries the answer from then on.
export async function GET(req: NextRequest) {
  const back = safeNext(req.nextUrl.searchParams.get('next')) ?? APP_URL.onlineorder;
  const deny = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));

  const token = sharedAccessToken(req.cookies);
  if (!token) {
    return NextResponse.redirect(
      `${APP_URL.pos}/login?next=${encodeURIComponent(back)}`
    );
  }

  // Supabase is the authority on whether the token is real and unexpired.
  const db = admin();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) {
    return NextResponse.redirect(
      `${APP_URL.pos}/login?next=${encodeURIComponent(back)}`
    );
  }

  const { data: profile } = await db
    .from('profiles')
    .select('id,email,full_name,role,department')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile) return deny('/no-access');

  // Signed in is not the same as allowed: a cashier holds a valid POS session
  // and still has no business in here.
  const { data: role } = await db.rpc('msgr_role_for', { p_id: auth.user.id });
  if (role !== 'manager' && role !== 'agent') return deny('/no-access');

  const res = NextResponse.redirect(back);
  res.cookies.set(
    SESSION_COOKIE,
    await signSession({
      uid: profile.id,
      email: profile.email ?? auth.user.email ?? '',
      name: (profile as { full_name?: string | null }).full_name ?? null,
      role: role as Role,
      exp: Date.now() + SESSION_DAYS * 86400_000,
    }),
    { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: SESSION_DAYS * 86400 }
  );
  return res;
}
