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

  if (payload.length) {
    const { error } = await admin().from('ad_insights').upsert(payload, { onConflict: 'date,ad_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: payload.length, since: fmt(since), until: fmt(until) });
}
