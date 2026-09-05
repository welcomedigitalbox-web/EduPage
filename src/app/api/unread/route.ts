import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * How many threads are waiting on us. A thread counts as unanswered when the
 * newest message in it came from the customer — which is exactly when
 * last_message_at still equals last_inbound_at.
 */
export async function GET() {
  const db = admin();
  const [waiting, needsHuman] = await Promise.all([
    db.from('msgr_conversations').select('id,last_message_at,last_inbound_at')
      .neq('status', 'closed').not('last_inbound_at', 'is', null).limit(1000),
    db.from('msgr_conversations').select('id', { count: 'exact', head: true })
      .eq('status', 'needs_human'),
  ]);
  const unanswered = (waiting.data ?? []).filter(
    (c) => c.last_message_at && c.last_inbound_at && c.last_message_at <= c.last_inbound_at
  ).length;

  return NextResponse.json({
    unanswered,
    needs_human: needsHuman.count ?? 0,
  });
}
