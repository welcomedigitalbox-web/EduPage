import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Add, change or remove one day's exchange rate. */
export async function POST(req: NextRequest) {
  const b = await req.json() as { date?: string; mmk_per_usd?: number; delete_date?: string };
  const db = admin();

  if (b.delete_date) {
    await db.from('msgr_fx_rates').delete().eq('date', b.delete_date);
    return NextResponse.json({ ok: true });
  }

  const rate = Number(b.mmk_per_usd);
  if (!b.date || !Number.isFinite(rate) || rate <= 0) {
    return NextResponse.json({ error: 'date and a positive rate are required' }, { status: 400 });
  }
  const { error } = await db.from('msgr_fx_rates')
    .upsert({ date: b.date, mmk_per_usd: rate, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
