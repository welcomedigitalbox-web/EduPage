import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { getSettings, fulfilmentStores } from '@/lib/crm';
import { createPendingSale, findCustomerByPhone, createCustomer, type OrderLine } from '@/lib/pos';

export const runtime = 'nodejs';

/**
 * Turns a Messenger conversation into a real POS order.
 *
 * The sale lands in the POS `sales` table with channel = 'messenger' and
 * order_status = 'pending', so staff pick, pack and complete it from the
 * existing Sale Order page. Stock is not touched here — the POS moves it when
 * the order is actually fulfilled.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json()) as {
    contact_id?: string;
    lines?: OrderLine[];
    store_id?: string;
    note?: string;
  };
  if (!b.contact_id || !b.lines?.length) {
    return NextResponse.json({ error: 'contact_id and at least one line required' }, { status: 400 });
  }

  const db = admin();
  const settings = await getSettings();

  const { data: contact } = await db
    .from('msgr_contacts')
    .select('id,name,phone,email,address,stage,store_id,customer_id,source_ad_id,source_campaign_id,psid,preferred_rep_id')
    .eq('id', b.contact_id).single();
  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 });

  const allowed = fulfilmentStores(settings);
  const storeId = b.store_id ?? contact.store_id ?? settings.default_store_id ?? allowed[0];
  if (!storeId) {
    return NextResponse.json(
      { error: 'No fulfilment store configured. Pick one in Settings first.' }, { status: 400 }
    );
  }
  // Never let a typo route an order to a shop that is not meant to fulfil online.
  if (allowed.length && !allowed.includes(storeId)) {
    return NextResponse.json({ error: 'store_not_allowed' }, { status: 400 });
  }

  // Reuse the POS customer record if this phone number already shops here,
  // so Messenger orders join the same purchase history and loyalty tier.
  let customerId = contact.customer_id as string | null;
  if (!customerId && contact.phone) {
    const found = await findCustomerByPhone(contact.phone, storeId);
    if (found) customerId = found.id;
  }
  if (!customerId && (contact.name || contact.phone)) {
    try {
      const created = await createCustomer({
        name: contact.name ?? `Messenger ${String(contact.psid).slice(-6)}`,
        phone: contact.phone ?? null,
        storeId,
        address: contact.address ?? null,
        facebook: contact.psid ? `psid:${contact.psid}` : null,
      });
      customerId = created.id;
    } catch {
      // A missing customer record must not block the order.
      customerId = null;
    }
  }
  if (customerId && customerId !== contact.customer_id) {
    await db.from('msgr_contacts').update({ customer_id: customerId, store_id: storeId }).eq('id', contact.id);
  }

  let sale;
  try {
    sale = await createPendingSale({
      storeId,
      customerId,
      customerName: contact.name ?? null,
      address: contact.address ?? null,
      lines: b.lines,
      note: b.note ?? null,
      saleRepId: contact.preferred_rep_id ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  // The attribution snapshot — this is what makes ROAS per ad possible later.
  await db.from('msgr_sale_links').insert({
    sale_id: sale.id,
    contact_id: contact.id,
    ad_id: contact.source_ad_id,
    campaign_id: contact.source_campaign_id,
  });

  await db.from('msgr_contacts').update({ stage: 'won' }).eq('id', contact.id);
  await db.from('msgr_lead_events').insert({
    contact_id: contact.id, from_stage: contact.stage, to_stage: 'won',
    reason: `POS order ${sale.sale_ref ?? sale.id} created`, actor: 'human',
  });
  await db.from('msgr_follow_ups')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('contact_id', contact.id).eq('status', 'pending');

  return NextResponse.json({ ok: true, sale });
}
