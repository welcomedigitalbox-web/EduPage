import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const b = await req.json();
  const allowed = [
    'is_enabled', 'business_name', 'language', 'persona', 'greeting',
    'handoff_keywords', 'office_hours', 'min_confidence', 'max_bot_turns',
    'follow_up_hours', 'ghost_hours',
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in b) patch[k] = b[k];
  const { error } = await admin().from('bot_settings').update(patch).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
