import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

async function requireManager() {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return s?.role === 'manager' ? s : null;
}

export async function GET() {
  if (!(await requireManager())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data } = await admin()
    .from('msgr_users').select('id,email,name,role,is_active,last_login_at,created_at')
    .order('created_at');
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireManager())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const b = (await req.json()) as {
    email?: string; name?: string; password?: string; role?: string;
  };
  if (!b.email || !b.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }
  if (b.password.length < 8) {
    return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
  }

  const { error } = await admin().from('msgr_users').insert({
    email: b.email.trim().toLowerCase(),
    name: b.name?.trim() || null,
    password_hash: await hashPassword(b.password),
    role: b.role === 'manager' ? 'manager' : 'agent',
  });
  if (error) {
    return NextResponse.json(
      { error: error.code === '23505' ? 'email_taken' : error.message }, { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
