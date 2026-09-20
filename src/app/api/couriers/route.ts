import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export async function GET() {
  const { data } = await db.from('couriers')
    .select('id, name, kind, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  return NextResponse.json({ rows: data ?? [] });
}
