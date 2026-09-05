import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint. Runs the exact same reads the webhook does, from the
 * server, and reports which one fails. Delete once the setup is verified.
 */
export async function GET() {
  const db = admin();
  const tables = [
    'msgr_settings', 'msgr_contacts', 'msgr_conversations', 'msgr_messages',
    'msgr_lead_events', 'msgr_follow_ups', 'msgr_kb_items', 'msgr_ai_runs',
    'msgr_ad_daily', 'msgr_sale_links',
    'products', 'product_variants', 'store_inventory', 'product_categories',
    'store_product_settings', 'stores', 'customers', 'sales', 'sale_items',
    'ad_campaigns', 'ad_daily_stats',
  ];

  const results: Record<string, string> = {};
  for (const t of tables) {
    const { error } = await db.from(t).select('*', { head: true, count: 'exact' }).limit(1);
    results[t] = error ? `${error.code ?? '?'}: ${error.message}` : 'ok';
  }

  const { data: settings } = await db.from('msgr_settings').select('*').eq('id', 1).maybeSingle();

  // Token health. The tokens themselves are marked Sensitive in Vercel and so
  // cannot be pulled locally — this asks Meta about them from the server,
  // where they do exist, and reports only the harmless parts.
  const tokens = await Promise.all(
    ([
      ['page', process.env.FB_PAGE_ACCESS_TOKEN],
      ['ads', process.env.META_ADS_ACCESS_TOKEN],
    ] as const).map(async ([label, token]) => {
      if (!token) return [label, { set: false }] as const;
      // The app id is public (it ships in every webhook URL), so a fallback
      // here saves adding one more env var just to run a diagnostic.
      const appId = process.env.FB_APP_ID || '1878015946939525';
      const secret = process.env.FB_APP_SECRET ?? '';
      if (!secret) return [label, { set: true, error: 'FB_APP_SECRET missing' }] as const;
      try {
        const r = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}` +
          `&access_token=${encodeURIComponent(`${appId}|${secret}`)}`
        );
        const j = await r.json() as {
          data?: { type?: string; is_valid?: boolean; expires_at?: number; scopes?: string[];
                   data_access_expires_at?: number; app_id?: string };
          error?: { message?: string };
        };
        if (j.error) return [label, { set: true, error: j.error.message }] as const;
        const d = j.data ?? {};
        const when = (t?: number) => (t === 0 || t == null ? 'never' : new Date(t * 1000).toISOString());
        return [label, {
          set: true,
          type: d.type,
          valid: d.is_valid,
          expires: when(d.expires_at),
          data_access_expires: when(d.data_access_expires_at),
          scopes: d.scopes,
        }] as const;
      } catch (e) {
        return [label, { set: true, error: String(e) }] as const;
      }
    })
  );

  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    service_key_tail: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(-6),
    default_store_id: settings?.default_store_id ?? null,
    bot_enabled: settings?.is_enabled ?? null,
    tables: results,
    ad_account_id: process.env.META_AD_ACCOUNT_ID ?? null,
    tokens: Object.fromEntries(tokens),
  });
}
