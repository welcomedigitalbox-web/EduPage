import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { fetchProfile } from '@/lib/meta';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorised(req: NextRequest) {
  const secret = env.cronSecret();
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Fill in the names that were never fetched while the profile call was broken.
 * Runs newest-first so the inbox looks right immediately, and can be called
 * repeatedly — each pass only touches contacts that still have no name.
 */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return new NextResponse('unauthorized', { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
  const db = admin();
  const { data: contacts } = await db
    .from('msgr_contacts').select('id,psid')
    .is('name', null)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  // One profile call at a time made 100 contacts overrun the function's time
  // limit. Ten at a time is well inside Meta's rate limits and finishes fast.
  let filled = 0;
  const errors: string[] = [];
  let firstError: unknown = null;
  const rows = contacts ?? [];
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(rows.slice(i, i + 10).map(async (c) => {
      const p = await fetchProfile(c.psid, (e) => { firstError ??= e; });
      if (!p?.name) { errors.push(c.psid); return; }
      await db.from('msgr_contacts')
        .update({ name: p.name, profile_pic: p.profile_pic }).eq('id', c.id);
      filled += 1;
    }));
  }

  return NextResponse.json({
    ok: true,
    checked: contacts?.length ?? 0,
    filled,
    failed: errors.length,
    // A couple of examples is enough to diagnose; the rest is noise.
    failed_sample: errors.slice(0, 3),
    // Meta's own words for the first failure, so the cause does not have to be
    // dug out of the deployment logs.
    first_error: firstError,
  });
}
