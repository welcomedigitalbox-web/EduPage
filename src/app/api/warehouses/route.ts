import { NextResponse } from 'next/server';
import { warehouses } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ rows: await warehouses() });
}
