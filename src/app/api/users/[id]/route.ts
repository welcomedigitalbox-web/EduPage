import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (me?.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const b = (await req.json()) as { role?: string; is_active?: boolean; password?: string; name?: string };

  // A manager locking themselves out would need database access to recover.
  if (id === me.uid && (b.is_active === false || b.role === 'agent')) {
    return NextResponse.json({ error: 'cannot_demote_self' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (b.role) patch.role = b.role === 'manager' ? 'manager' : 'agent';
  if (typeof b.is_active === 'boolean') patch.is_active = b.is_active;
  if (typeof b.name === 'string') patch.name = b.name.trim() || null;
  if (b.password) {
    if (b.password.length < 8) return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
    patch.password_hash = await hashPassword(b.password);
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const { error } = await admin().from('msgr_users').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
