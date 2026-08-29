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

  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    service_key_tail: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(-6),
    default_store_id: settings?.default_store_id ?? null,
    bot_enabled: settings?.is_enabled ?? null,
    tables: results,
  });
}
