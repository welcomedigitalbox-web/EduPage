import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const graph = (p: string) => `https://graph.facebook.com/${env.fbApiVersion()}/${p}`;

// Yesterday in Myanmar time (UTC+6:30), which is the day the report covers.
function reportDay(offsetDays = 1) {
  const now = new Date(Date.now() + 6.5 * 3600 * 1000);
  now.setUTCDate(now.getUTCDate() - offsetDays);
  return now.toISOString().slice(0, 10);
}

type Insight = { name: string; values: { value: unknown; end_time?: string }[] };

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const day = req.nextUrl.searchParams.get('date') || reportDay();

  const { data: st } = await admin()
    .from('msgr_settings')
    .select('page_id, page_name, page_access_token')
    .eq('id', 1)
    .single();

  if (!st?.page_access_token || !st.page_id) {
    return NextResponse.json({ error: 'page not connected' }, { status: 400 });
  }

  // Insights are reported per day; ask for the one day and read the first value.
  const since = day;
  const until = new Date(new Date(day + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
  const metrics = 'page_impressions,page_impressions_unique,page_post_engagements';

  const url =
    `${graph(st.page_id + '/insights')}?metric=${metrics}` +
    `&period=day&since=${since}&until=${until}&access_token=${st.page_access_token}`;

  const res = (await fetch(url).then((r) => r.json()).catch(() => null)) as
    | { data?: Insight[]; error?: { message?: string } }
    | null;

  if (!res || res.error) {
    return NextResponse.json({ error: res?.error?.message || 'graph call failed' }, { status: 502 });
  }

  const pick = (name: string) => {
    const m = (res.data || []).find((d) => d.name === name);
    const v = m?.values?.[0]?.value;
    return typeof v === 'number' ? v : null;
  };

  // Messages that day come from our own inbox, which is more reliable than
  // Facebook's conversation metrics.
  const { count: leads } = await admin()
    .from('msgr_orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', day + 'T00:00:00Z')
    .lt('created_at', until + 'T00:00:00Z');

  const row = {
    stat_date: day,
    platform: st.page_name || 'Facebook Page',
    page_id: st.page_id,
    campaign: null as string | null,
    reach: pick('page_impressions_unique'),
    impressions: pick('page_impressions'),
    engagement: pick('page_post_engagements'),
    leads: leads ?? null,
    source: 'facebook',
    synced_at: new Date().toISOString(),
  };

  const { error } = await admin()
    .from('mkt_platform_daily')
    .upsert(row, { onConflict: 'stat_date,platform,campaign' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, day, row });
}
