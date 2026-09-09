import { admin } from './supabase';

export interface OrderItem {
  id?: string;
  barcode: string | null;
  description: string;
  unit_price: number;
  qty: number;
  line_total: number;
}

export interface OrderInput {
  id?: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  customer_name: string;
  phone?: string | null;
  city?: string | null;
  delivery_address?: string | null;
  shop_id?: string | null;
  order_date?: string;
  delivery_method?: string | null;
  payment_method?: string;
  payment_channel_id?: string | null;
  payment_ref?: string | null;
  advance_payment?: number;
  delivery_fee?: number;
  discount?: number;
  status?: string;
  note?: string | null;
  items: OrderItem[];
}

export const ORDER_STATUSES = [
  'pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled',
] as const;

/** Money is recomputed server-side. A total that arrives from the browser is a
 *  suggestion, not a fact. */
export function totals(input: {
  items: OrderItem[]; discount?: number; delivery_fee?: number;
}) {
  const subtotal = input.items.reduce(
    (a, i) => a + Number(i.unit_price || 0) * Number(i.qty || 0), 0
  );
  const discount = Number(input.discount || 0);
  const delivery = Number(input.delivery_fee || 0);
  return {
    subtotal,
    grand_total: Math.max(0, subtotal - discount + delivery),
  };
}

export async function saveOrder(
  input: OrderInput,
  actor: { id?: string | null; name?: string | null }
) {
  const db = admin();
  const items = (input.items ?? [])
    .filter((i) => i.description?.trim())
    .map((i, idx) => ({
      barcode: i.barcode?.trim() || null,
      description: i.description.trim(),
      unit_price: Number(i.unit_price || 0),
      qty: Number(i.qty || 0),
      line_total: Number(i.unit_price || 0) * Number(i.qty || 0),
      sort_order: idx,
    }));
  if (!items.length) throw new Error('an order needs at least one line');

  const { subtotal, grand_total } = totals({
    items, discount: input.discount, delivery_fee: input.delivery_fee,
  });

  const row: Record<string, unknown> = {
    contact_id: input.contact_id ?? null,
    conversation_id: input.conversation_id ?? null,
    customer_name: input.customer_name.trim(),
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
    delivery_address: input.delivery_address?.trim() || null,
    shop_id: input.shop_id || null,
    order_date: input.order_date || undefined,
    delivery_method: input.delivery_method?.trim() || null,
    payment_method: input.payment_method || 'cod',
    payment_channel_id: input.payment_channel_id || null,
    payment_ref: input.payment_ref?.trim() || null,
    advance_payment: Number(input.advance_payment || 0),
    delivery_fee: Number(input.delivery_fee || 0),
    discount: Number(input.discount || 0),
    subtotal,
    grand_total,
    status: input.status || 'pending',
    note: input.note?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await db.from('msgr_orders').update(row).eq('id', input.id);
    if (error) throw new Error(error.message);
    // Lines are replaced wholesale: editing five rows into three is far more
    // error-prone as a diff than as a rewrite.
    await db.from('msgr_order_items').delete().eq('order_id', input.id);
    const { error: itemErr } = await db.from('msgr_order_items')
      .insert(items.map((i) => ({ ...i, order_id: input.id })));
    if (itemErr) throw new Error(itemErr.message);
    return input.id;
  }

  // Freeze the attribution now, from the contact this order came out of.
  if (input.contact_id) {
    const { data: c } = await db.from('msgr_contacts')
      .select('source_type,source_ad_id,source_campaign_id')
      .eq('id', input.contact_id).maybeSingle();
    if (c) {
      row.source_type = c.source_type;
      row.source_ad_id = c.source_ad_id;
      row.source_campaign_id = c.source_campaign_id;
    }
  }
  row.created_by = actor.id ?? null;
  row.created_by_name = actor.name ?? null;

  const { data: order, error } = await db.from('msgr_orders')
    .insert(row).select('id').single();
  if (error) throw new Error(error.message);

  const { error: itemErr } = await db.from('msgr_order_items')
    .insert(items.map((i) => ({ ...i, order_id: order.id })));
  if (itemErr) {
    // An order with no lines is worse than no order.
    await db.from('msgr_orders').delete().eq('id', order.id);
    throw new Error(itemErr.message);
  }

  // Mark the lead as ordered so the funnel reflects reality.
  if (input.contact_id) {
    await db.from('msgr_contacts').update({ stage: 'ordered' }).eq('id', input.contact_id);
  }
  return order.id as string;
}

export async function shops() {
  const { data } = await admin()
    .from('msgr_shops').select('id,name,region,address')
    .eq('is_active', true).order('sort_order');
  return data ?? [];
}

export async function paymentChannels(opts: { all?: boolean } = {}) {
  let q = admin()
    .from('msgr_payment_channels').select('id,name,kind,account_name,account_no,is_active')
    .order('sort_order').order('name');
  if (!opts.all) q = q.eq('is_active', true);
  const { data } = await q;
  return data ?? [];
}

export async function orderList(opts: {
  status?: string; q?: string; since?: string; until?: string; limit?: number;
}) {
  let q = admin()
    .from('msgr_orders')
    .select('*, msgr_shops(name), msgr_order_items(id)')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.since) q = q.gte('order_date', opts.since);
  if (opts.until) q = q.lte('order_date', opts.until);
  if (opts.q?.trim()) {
    const term = opts.q.replace(/[%,]/g, ' ').trim();
    q = q.or(`customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data } = await q;
  return data ?? [];
}

export async function orderDetail(id: string) {
  const db = admin();
  const { data: order } = await db
    .from('msgr_orders')
    .select('*, msgr_shops(name,region), msgr_payment_channels(name,kind)')
    .eq('id', id).maybeSingle();
  if (!order) return null;
  const { data: items } = await db
    .from('msgr_order_items').select('*').eq('order_id', id).order('sort_order');
  return { order, items: items ?? [] };
}
