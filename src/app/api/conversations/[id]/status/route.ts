import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { status, assigned_to } = (await req.json()) as { status?: string; assigned_to?: string };
  const allowed = ['bot_handling', 'needs_human', 'human_handling', 'closed'];
  if (!status || !allowed.includes(status)) {
    return NextResponse.json({ error: 'bad status' }, { status: 400 });
  }
  const patch: Record<string, unknown> = { status };
  if (assigned_to !== undefined) patch.assigned_to = assigned_to;
  if (status === 'closed') patch.closed_at = new Date().toISOString();
  if (status !== 'needs_human') { patch.needs_human_reason = null; patch.needs_human_since = null; }
  await admin().from('conversations').update(patch).eq('id', id);
  return NextResponse.json({ ok: true });
}
