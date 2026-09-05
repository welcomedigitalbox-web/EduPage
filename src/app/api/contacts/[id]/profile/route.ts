import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { getSettings, fulfilmentStores } from '@/lib/crm';
import { findCustomer, upsertPosCustomer } from '@/lib/pos';

export const runtime = 'nodejs';

interface Body {
  name?: string; phone?: string; email?: string; address?: string; city?: string;
  tags?: string[]; notes?: string; store_id?: string | null;
  preferred_rep_id?: string | null; loyalty_tier_id?: string | null;
  /** Create or update the matching POS customer record. */
  sync_pos?: boolean;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as Body;
  const db = admin();

  const { data: contact } = await db
    .from('msgr_contacts')
    .select('id,psid,name,phone,email,address,city,store_id,customer_id,preferred_rep_id')
    .eq('id', id).maybeSingle();
  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const str = (v: string | undefined) => (typeof v === 'string' ? v.trim() || null : undefined);
  if (str(b.name) !== undefined) patch.name = str(b.name);
  if (str(b.phone) !== undefined) patch.phone = str(b.phone);
  if (str(b.email) !== undefined) patch.email = str(b.email)?.toLowerCase() ?? null;
  if (str(b.address) !== undefined) patch.address = str(b.address);
  if (str(b.city) !== undefined) patch.city = str(b.city);
  if (typeof b.notes === 'string') patch.notes = b.notes.slice(0, 4000);
  if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  if (b.store_id !== undefined) patch.store_id = b.store_id || null;
  if (b.preferred_rep_id !== undefined) patch.preferred_rep_id = b.preferred_rep_id || null;

  if (Object.keys(patch).length) {
    const { error } = await db.from('msgr_contacts').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!b.sync_pos) return NextResponse.json({ ok: true, customer_id: contact.customer_id });

  // ---- Promote to a real POS customer ----
  const merged = { ...contact, ...patch } as typeof contact;
  const name = (merged.name as string) || `Messenger ${contact.psid.slice(-6)}`;
  const phone = (merged.phone as string) ?? null;
  const email = (merged.email as string) ?? null;

  if (!phone && !email) {
    return NextResponse.json({ error: 'need_phone_or_email' }, { status: 400 });
  }

  const settings = await getSettings();
  const storeId =
    (b.store_id ?? (merged.store_id as string)) ||
    settings.default_store_id ||
    fulfilmentStores(settings)[0];
  if (!storeId) return NextResponse.json({ error: 'no_store' }, { status: 400 });

  // Reuse the existing record if this person already shops here.
  let customerId = contact.customer_id as string | null;
  if (!customerId) {
    const found = await findCustomer({ phone, email, psid: contact.psid });
    customerId = found?.id ?? null;
  }

  try {
    const customer = await upsertPosCustomer({
      customerId,
      name,
      phone,
      email,
      address: (merged.address as string) ?? null,
      storeId,
      loyaltyTierId: b.loyalty_tier_id ?? null,
      psid: contact.psid,
    });
    await db.from('msgr_contacts')
      .update({ customer_id: customer.id, store_id: storeId }).eq('id', id);
    return NextResponse.json({ ok: true, customer_id: customer.id, created: !customerId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
