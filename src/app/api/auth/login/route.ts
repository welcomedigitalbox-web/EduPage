import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { verifyPassword } from '@/lib/password';
import { signSession, SESSION_COOKIE, SESSION_DAYS, type Role } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: 'missing' }, { status: 400 });

  const db = admin();
  const { data: user } = await db
    .from('msgr_users')
    .select('id,email,name,password_hash,role,is_active')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  // Same response whether the account is missing, disabled or the password is
  // wrong — otherwise the form doubles as a way to enumerate staff emails.
  if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'bad_credentials' }, { status: 401 });
  }

  await db.from('msgr_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  const token = await signSession({
    uid: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role as Role,
    exp: Date.now() + SESSION_DAYS * 86400_000,
  });

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
