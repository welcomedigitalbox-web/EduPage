import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { fetchPageDaily, fetchPosts } from '@/lib/page-insights';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const secret = env.cronSecret();
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return new NextResponse('unauthorized', { status: 401 });

  const days = Number(req.nextUrl.searchParams.get('days') ?? 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const since = fmt(new Date(Date.now() - days * 86400_000));
  const until = fmt(new Date());
  const db = admin();

  let daily, posts;
  try {
    daily = await fetchPageDaily(since, until);
    posts = await fetchPosts(Number(req.nextUrl.searchParams.get('posts') ?? 25));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  // The follower total is a snapshot, not a series — stamp it on today's row
  // only, so past days keep the number they actually had.
  const today = fmt(new Date());
  const rows = daily.days.map((d) => ({
    date: d.date,
    impressions: d.impressions,
    reach: d.reach,
    engagements: d.engagements,
    video_views: d.video_views,
    new_follows: d.new_follows,
    followers_total: d.date === today ? daily.followers : null,
    fans_total: d.date === today ? daily.fans : null,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await db.from('msgr_page_daily').upsert(rows, { onConflict: 'date' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (posts.length) {
    const { error } = await db.from('msgr_page_posts').upsert(
      posts.map((p) => ({ ...p, updated_at: new Date().toISOString() })),
      { onConflict: 'post_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    days: rows.length,
    posts: posts.length,
    followers: daily.followers,
    warnings: daily.warnings,
  });
}
