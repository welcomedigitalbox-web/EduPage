import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

const ALLOWED = ['agent', 'manager', 'none', 'auto'] as const;

// Letting someone in, or keeping them out, by hand. 'auto' drops the
// exception and lets the job decide again.
export async function PUT(req: Request) {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (s?.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as { userId?: string; access?: string };
  const userId = String(body.userId || '');
  const access = String(body.access || '');
  if (!userId || !ALLOWED.includes(access as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const db = admin();
  const { error } =
    access === 'auto'
      ? await db.from('msgr_access').delete().eq('user_id', userId)
      : await db
          .from('msgr_access')
          .upsert(
            { user_id: userId, access, set_by: s.email ?? null, set_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
