import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { fetchAdInsights, messagingConversations } from '@/lib/meta';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const secret = env.cronSecret();
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Pulls the last N days of per-ad spend from the Marketing API.
 *  Re-pulling recent days is intentional: Meta restates spend for ~72h. */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return new NextResponse('unauthorized', { status: 401 });

  const days = Number(req.nextUrl.searchParams.get('days') ?? 7);
  const until = new Date();
  const since = new Date(Date.now() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let rows;
  try {
    rows = await fetchAdInsights(fmt(since), fmt(until));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  const account = env.metaAdAccountId();
  const payload = rows
    .filter((r) => r.ad_id)
    .map((r) => ({
      date: r.date_start,
      ad_account_id: account,
      campaign_id: r.campaign_id ?? null,
      campaign_name: r.campaign_name ?? null,
      adset_id: r.adset_id ?? null,
      adset_name: r.adset_name ?? null,
      ad_id: r.ad_id!,
      ad_name: r.ad_name ?? null,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      clicks: Number(r.clicks ?? 0),
      messaging_conversations_started: messagingConversations(r),
      currency: r.account_currency ?? null,
      raw: r as unknown,
      synced_at: new Date().toISOString(),
    }));

  if (!payload.length) {
    return NextResponse.json({ ok: true, synced: 0, since: fmt(since), until: fmt(until) });
  }

  const db = admin();
  const { error } = await db.from('msgr_ad_daily').upsert(payload, { onConflict: 'date,ad_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ---- Roll the ad-level rows up into the POS campaign tables, so the POS
  // Campaigns page keeps working off one synced source instead of hand entry.
  const campaigns = new Map<string, { name: string; objective: string | null }>();
  for (const r of payload) {
    if (r.campaign_id) campaigns.set(r.campaign_id, { name: r.campaign_name ?? r.campaign_id, objective: null });
  }

  const { data: known } = await db
    .from('ad_campaigns').select('id,external_id').eq('platform', 'meta')
    .in('external_id', [...campaigns.keys()]);
  const idByExternal = new Map((known ?? []).map((c) => [c.external_id as string, c.id as string]));

  for (const [externalId, meta] of campaigns) {
    if (idByExternal.has(externalId)) continue;
    const firstDate = payload.filter((p) => p.campaign_id === externalId)
      .map((p) => p.date).sort()[0];
    const { data: created } = await db.from('ad_campaigns').insert({
      platform: 'meta', external_id: externalId, name: meta.name,
      start_date: firstDate, budget: 0, created_by: 'messenger-sync',
    }).select('id').single();
    if (created) idByExternal.set(externalId, created.id);
  }

  // campaign_id + date -> summed spend across that campaign's ads
  const rollup = new Map<string, { campaign_id: string; stat_date: string; spend: number; impressions: number; clicks: number; reach: number }>();
  for (const r of payload) {
    const cid = r.campaign_id ? idByExternal.get(r.campaign_id) : undefined;
    if (!cid) continue;
    const k = `${cid}|${r.date}`;
    const cur = rollup.get(k) ?? { campaign_id: cid, stat_date: r.date, spend: 0, impressions: 0, clicks: 0, reach: 0 };
    cur.spend += r.spend;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.reach += r.reach;
    rollup.set(k, cur);
  }
  if (rollup.size) {
    await db.from('ad_daily_stats').upsert([...rollup.values()], { onConflict: 'campaign_id,stat_date' });
  }

  return NextResponse.json({
    ok: true, synced: payload.length, campaigns: rollup.size,
    since: fmt(since), until: fmt(until),
  });
}
