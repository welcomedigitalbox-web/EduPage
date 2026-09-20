import { NextResponse } from 'next/server';
import { fetchSellablePooled } from '@/lib/pos';

export const dynamic = 'force-dynamic';

// The POS catalogue, pooled across both warehouses, so an online order can
// name the product it is actually selling instead of a typed-in string.
export async function GET() {
  const items = await fetchSellablePooled(['YGN-WH', 'MDY-WH'], 2000);
  return NextResponse.json({
    items: items
      .filter((p) => p.sku)
      .map((p) => ({
        product_id: p.product_id,
        variant_id: p.variant_id,
        label: p.display_name,
        sku: p.sku as string,
        price: p.price,
        stock: p.stock_qty,
      })),
  });
}
