import { NextRequest, NextResponse } from 'next/server';
import { fetchSellable } from '@/lib/pos';
import { getSettings } from '@/lib/crm';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Live POS product list for the order builder in the dashboard. */
export async function GET(req: NextRequest) {
  const settings = await getSettings();
  const storeId = req.nextUrl.searchParams.get('store_id') ?? settings.default_store_id;
  if (!storeId) return NextResponse.json({ products: [], stores: [] });
  const [products, { data: stores }] = await Promise.all([
    fetchSellable(storeId, 1000),
    admin().from('stores').select('id,name').eq('is_active', true).order('name'),
  ]);
  return NextResponse.json({ products, stores: stores ?? [], store_id: storeId });
}
