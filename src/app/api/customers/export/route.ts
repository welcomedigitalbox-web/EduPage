import { NextRequest, NextResponse } from 'next/server';
import { customerList } from '@/lib/queries';

export const runtime = 'nodejs';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const rows = await customerList({
    q: p.get('q') ?? undefined,
    stage: p.get('stage') ?? undefined,
    source: p.get('source') ?? undefined,
    limit: 5000,
  });

  const header = [
    'name', 'phone', 'address', 'stage', 'tags', 'source', 'ad_id',
    'first_seen', 'last_message', 'orders', 'revenue', 'notes', 'psid',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.name, r.phone, r.address, r.stage, r.tags.join(' | '),
      r.source_ad_id ? 'ad' : (r.source_type ?? 'organic'), r.source_ad_id,
      r.first_seen_at?.slice(0, 10), r.last_inbound_at?.slice(0, 10) ?? '',
      r.orders, r.revenue, r.notes, r.psid,
    ].map(csvCell).join(','));
  }

  // BOM so Excel opens Burmese text correctly.
  return new NextResponse('﻿' + lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
