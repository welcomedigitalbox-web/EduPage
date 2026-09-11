import { NextRequest, NextResponse } from 'next/server';
import { orderList } from '@/lib/orders';
import { cleanAddress } from '@/lib/mm-address';

export const runtime = 'nodejs';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Orders as a spreadsheet. The typed address is exported untouched, and the
 * township and region it was parsed into arrive as two extra columns — so a
 * pivot table can group by township without anyone having to retype anything,
 * and a row the parser could not place is visibly blank rather than guessed.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const rows = await orderList({
    status: p.get('status') ?? undefined,
    q: p.get('q') ?? undefined,
    since: p.get('since') ?? undefined,
    until: p.get('until') ?? undefined,
    shop_id: p.get('shop') ?? undefined,
    payment_method: p.get('pay') ?? undefined,
    payment_channel_id: p.get('channel') ?? undefined,
    seller: p.get('seller') ?? undefined,
    limit: 5000,
  });

  const header = [
    'order_no', 'order_date', 'status', 'payment_status', 'delivery_status',
    'customer_name', 'phone', 'city_typed', 'address_typed',
    'region_en', 'region_mm', 'city_clean', 'township_clean', 'address_matched',
    'shop', 'sales_person', 'payment_method', 'payment_channel', 'payment_ref',
    'delivery_method', 'items', 'subtotal', 'discount', 'delivery_fee',
    'grand_total', 'advance_paid', 'balance_due', 'source', 'ad_id',
  ];

  const lines = [header.join(',')];
  for (const o of rows) {
    // City and address are both free text, so both are searched: a row that
    // only says "တာမွေ" in the city box places just as well as one that says
    // it in the address.
    const clean = cleanAddress(
      [o.city as string, o.delivery_address as string].filter(Boolean).join(' ')
    );
    const advance = Number(o.advance_payment ?? 0);
    lines.push([
      `EBH-${String(o.order_no).padStart(5, '0')}`,
      o.order_date, o.status, o.payment_status ?? '', o.delivery_status ?? '',
      o.customer_name, o.phone,
      o.city, o.delivery_address,
      clean.region, clean.regionMm, clean.city, clean.township,
      clean.matched ? 'yes' : 'no',
      (o.msgr_shops as { name?: string } | null)?.name ?? '',
      o.sales_person_name ?? '',
      o.payment_method,
      (o.msgr_payment_channels as { name?: string } | null)?.name ?? '',
      o.payment_ref ?? '',
      o.delivery_method ?? '',
      (o.msgr_order_items as unknown[] | null)?.length ?? 0,
      o.subtotal, o.discount, o.delivery_fee, o.grand_total,
      advance, Number(o.grand_total ?? 0) - advance,
      o.source_ad_id ? 'ad' : (o.source_type ?? 'organic'),
      o.source_ad_id ?? '',
    ].map(csvCell).join(','));
  }

  // The BOM is what makes Excel open Burmese correctly instead of as mojibake.
  return new NextResponse('﻿' + lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
