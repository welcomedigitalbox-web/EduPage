import { NextRequest, NextResponse } from 'next/server';
import { fetchSellablePooled, fetchStores } from '@/lib/pos';
import { getSettings, fulfilmentStores } from '@/lib/crm';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Live pooled product list plus the shops that can ship, for the order builder. */
export async function GET(req: NextRequest) {
  const settings = await getSettings();
  const storeIds = fulfilmentStores(settings);
  if (!storeIds.length) return NextResponse.json({ products: [], stores: [], contact: null });

  const contactId = req.nextUrl.searchParams.get('contact_id');
  const [products, allStores, contact] = await Promise.all([
    fetchSellablePooled(storeIds, 1000),
    fetchStores(),
    contactId
      ? admin().from('msgr_contacts').select('address,phone,store_id').eq('id', contactId).maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    products,
    stores: allStores.filter((s) => storeIds.includes(s.id)),
    contact,
  });
}
