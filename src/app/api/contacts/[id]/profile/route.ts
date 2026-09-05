import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Staff-editable CRM fields on a Messenger contact. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as {
    tags?: string[]; notes?: string; phone?: string; address?: string; name?: string;
  };

  const patch: Record<string, unknown> = {};
  if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  if (typeof b.notes === 'string') patch.notes = b.notes.slice(0, 4000);
  if (typeof b.phone === 'string') patch.phone = b.phone.trim() || null;
  if (typeof b.address === 'string') patch.address = b.address.trim() || null;
  if (typeof b.name === 'string') patch.name = b.name.trim() || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const { error } = await admin().from('msgr_contacts').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
