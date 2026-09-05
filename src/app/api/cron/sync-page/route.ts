import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { fetchPageDaily, fetchPosts, probeMetrics, probePostMetrics } from '@/lib/page-insights';

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

  // ?probe=1 answers "which metric names does Meta still honour today"
  if (req.nextUrl.searchParams.get('probe')) {
    const page = await probeMetrics([
      // Reach candidates, newest naming first
      'page_daily_reach', 'page_reach', 'page_content_reach',
      'page_total_reach', 'page_organic_reach', 'page_engaged_users',
      'page_content_activity', 'page_total_actions',
      'page_fans', 'page_fan_adds', 'page_follows',
      'page_video_views_unique', 'page_posts_served_impressions_organic_unique',
    ], since, until);
    const { data: p } = await db.from('msgr_page_posts')
      .select('post_id').order('created_time', { ascending: false }).limit(1).maybeSingle();
    const post = p?.post_id
      ? await probePostMetrics(p.post_id, [
          'post_impressions', 'post_impressions_unique', 'post_reach',
          'post_clicks', 'post_video_views', 'post_reactions_by_type_total',
          'post_activity', 'post_engaged_users', 'post_video_avg_time_watched',
          'blue_reels_play_count', 'post_video_view_time',
        ])
      : { note: 'no post stored yet' };
    return NextResponse.json({ page, post });
  }

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
    engagements: d.engagements,
    video_views: d.video_views,
    new_follows: d.new_follows,
    page_views: d.page_views,
    // page_follows gives a real daily series; fall back to today's snapshot.
    followers_total: d.followers || (d.date === today ? daily.followers : null),
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
