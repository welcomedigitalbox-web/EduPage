import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { signSession, SESSION_COOKIE, SESSION_DAYS } from '@/lib/session';

export const runtime = 'nodejs';

/** Signs in against the POS Supabase project, so staff use the same account
 *  they already have. The POS `profiles` row supplies the role. */
export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: 'missing' }, { status: 400 });
  }

  const anon = createClient(env.supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: 'bad_credentials' }, { status: 401 });
  }

  // Read the profile with the service role so RLS on `profiles` can't lock us out.
  const { data: profile } = await admin()
    .from('profiles').select('id,email,role,store_id').eq('id', data.user.id).maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 403 });
  }

  const token = await signSession({
    uid: data.user.id,
    email: profile.email ?? data.user.email ?? '',
    role: profile.role ?? 'cashier',
    store_id: profile.store_id ?? null,
    exp: Date.now() + SESSION_DAYS * 86400_000,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
