import { admin } from './supabase';
import { discountAmount } from './order-rules';
import { paymentState } from './order-payment';

export interface OrderItem {
  id?: string;
  barcode: string | null;
  product_id?: string | null;
  variant_id?: string | null;
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
  payment_slip_url?: string | null;
  payment_slips?: string[];
  sales_person_id?: string | null;
  advance_payment?: number;
  delivery_fee?: number;
  discount?: number;
  discount_type?: string;
  discount_value?: number;
  order_channel_id?: string | null;
  sale_type?: string;
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
  discount_type?: string; discount_value?: number;
}) {
  const subtotal = input.items.reduce(
    (a, i) => a + Number(i.unit_price || 0) * Number(i.qty || 0), 0
  );
  const discount = discountAmount(
    subtotal, input.discount_type, input.discount_value, input.discount
  );
  const delivery = Number(input.delivery_fee || 0);
  return {
    subtotal,
    discount,
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
      product_id: i.product_id || null,
      variant_id: i.variant_id || null,
      description: i.description.trim(),
      unit_price: Number(i.unit_price || 0),
      qty: Number(i.qty || 0),
      line_total: Number(i.unit_price || 0) * Number(i.qty || 0),
      sort_order: idx,
    }));
  if (!items.length) throw new Error('an order needs at least one line');

  // Copy the seller's name onto the order: the list they came from is editable,
  // and an order from last year must still say who sold it.
  let sellerName: string | null = null;
  if (input.sales_person_id) {
    const { data: sp } = await db.from('msgr_sales_people')
      .select('name').eq('id', input.sales_person_id).maybeSingle();
    sellerName = (sp?.name as string) ?? null;
  }

  const { subtotal, discount, grand_total } = totals({
    items, discount: input.discount, delivery_fee: input.delivery_fee,
    discount_type: input.discount_type, discount_value: input.discount_value,
  });

  const slips = (input.payment_slips ?? [])
    .map((u) => u?.trim()).filter(Boolean) as string[];
  if (!slips.length && input.payment_slip_url?.trim()) slips.push(input.payment_slip_url.trim());

  let channelName: string | null = null;
  if (input.order_channel_id) {
    const { data: ch } = await db.from('msgr_order_channels')
      .select('name').eq('id', input.order_channel_id).maybeSingle();
    channelName = (ch?.name as string) ?? null;
  }

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
    // The first slip is mirrored into the old column so nothing that reads it
    // has to know about the array.
    payment_slips: slips,
    payment_slip_url: slips[0] ?? null,
    sales_person_id: input.sales_person_id || null,
    sales_person_name: sellerName,
    advance_payment: Number(input.advance_payment || 0),
    // The advance is money in hand, so it counts as received from the start.
    amount_received: Number(input.advance_payment || 0),
    delivery_fee: Number(input.delivery_fee || 0),
    discount,
    discount_type: input.discount_type === 'percent' ? 'percent' : 'amount',
    discount_value: Number(input.discount_value ?? input.discount ?? 0),
    order_channel_id: input.order_channel_id || null,
    sale_type: input.sale_type === 'wholesale' ? 'wholesale' : 'retail',
    order_channel_name: channelName,
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

export async function orderChannels(opts: { all?: boolean } = {}) {
  let q = admin()
    .from('msgr_order_channels').select('id,name,is_active')
    .order('sort_order').order('name');
  if (!opts.all) q = q.eq('is_active', true);
  const { data } = await q;
  return data ?? [];
}

export async function salesPeople(opts: { all?: boolean } = {}) {
  let q = admin()
    .from('msgr_sales_people').select('id,name,phone,shop_id,is_active')
    .order('sort_order').order('name');
  if (!opts.all) q = q.eq('is_active', true);
  const { data } = await q;
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

/** Every order this person has placed, newest first, with enough of the item
 *  names to recognise them without opening the order. */
export async function contactOrders(contactId: string) {
  const { data } = await admin()
    .from('msgr_orders')
    .select('id,order_no,order_date,status,grand_total,advance_payment,msgr_order_items(description,qty)')
    .eq('contact_id', contactId)
    .order('order_date', { ascending: false })
    .limit(20);
  return (data ?? []) as unknown as {
    id: string; order_no: number; order_date: string; status: string;
    grand_total: number; advance_payment: number;
    msgr_order_items: { description: string; qty: number }[];
  }[];
}

/** Comma-separated query params arrive as strings; a filter with one value and
 *  a filter with five go down the same path. */
function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

/** Only the columns the list actually paints. Selecting `*` dragged the
 *  address, the note and every slip URL across the wire for rows that never
 *  show them. */
const LIST_COLUMNS =
  'id,order_no,order_date,status,payment_status,delivery_status,customer_name,phone,' +
  'payment_method,advance_payment,amount_received,grand_total,sale_type,' +
  'sales_person_name,order_channel_name,source_type,source_ad_id,shop_id,' +
  'msgr_shops(name),msgr_payment_channels(name),msgr_order_items(id)';

export async function orderList(opts: {
  status?: string; q?: string; since?: string; until?: string; limit?: number;
  shop_id?: string; created_by?: string; payment_method?: string; payment_channel_id?: string;
  seller?: string; src?: string; paid?: string; sale_type?: string;
  page?: number; perPage?: number;
  /** The CSV wants the columns the screen never shows. */
  full?: boolean;
  /** Just the three numbers the summary line adds up. */
  totalsOnly?: boolean;
}) {
  const perPage = opts.perPage ?? opts.limit ?? 500;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * perPage;

  let q = admin()
    .from('msgr_orders')
    .select(
      opts.full
        ? '*, msgr_shops(name), msgr_payment_channels(name), msgr_order_items(id)'
        : opts.totalsOnly
          ? 'status,grand_total,amount_received'
          : LIST_COLUMNS,
      { count: 'exact' }
    )
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1);
  const apply = (col: string, raw: string | undefined) => {
    const vs = list(raw);
    if (vs.length === 1) q = q.eq(col, vs[0]);
    else if (vs.length > 1) q = q.in(col, vs);
  };
  apply('status', opts.status);
  apply('shop_id', opts.shop_id);
  apply('created_by', opts.created_by);
  apply('payment_method', opts.payment_method);
  apply('payment_channel_id', opts.payment_channel_id);
  apply('sales_person_id', opts.seller);
  apply('order_channel_id', opts.src);
  apply('sale_type', opts.sale_type);
  // The trigger keeps payment_status in step with the money, so paid /
  // part-paid / unpaid is a plain column filter now — no fetching everything
  // and sieving it in JavaScript, which also broke paging.
  const PAY_TRACK: Record<string, string> = {
    paid: 'done', partial: 'processing', unpaid: 'pending',
  };
  const states = list(opts.paid).map((x) => PAY_TRACK[x]).filter(Boolean);
  if (states.length === 1) q = q.eq('payment_status', states[0]);
  else if (states.length > 1) q = q.in('payment_status', states);
  // Paid / part-paid / unpaid is a comparison between two columns, which
  // PostgREST cannot express — so it is narrowed here after the fetch.
  if (opts.since) q = q.gte('order_date', opts.since);
  if (opts.until) q = q.lte('order_date', opts.until);
  if (opts.q?.trim()) {
    const term = opts.q.replace(/[%,]/g, ' ').trim();
    q = q.or(`customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data, count } = await q;
  // The select string is chosen at runtime, so PostgREST cannot infer the row
  // shape; the callers know what they asked for.
  return {
    rows: (data ?? []) as unknown as Record<string, unknown>[],
    total: count ?? 0,
    page,
    perPage,
  };
}

/** The money behind the whole filtered set, not just the page on screen — a
 *  total that only counts the first fifty rows is worse than no total. */
export async function orderTotals(opts: Parameters<typeof orderList>[0]) {
  const { rows } = await orderList({ ...opts, page: 1, perPage: 5000, totalsOnly: true });
  const live = rows.filter((o) => o.status !== 'cancelled');
  return {
    count: live.length,
    revenue: live.reduce((a, o) => a + Number(o.grand_total ?? 0), 0),
    outstanding: live.reduce(
      (a, o) => a + Math.max(0, Number(o.grand_total ?? 0) - Number(o.amount_received ?? 0)), 0
    ),
  };
}

export async function orderPayments(orderId: string) {
  const { data } = await admin()
    .from('msgr_order_payments')
    .select('id,amount,channel_name,ref,paid_at,note,actor_name,slips')
    .eq('order_id', orderId)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false });
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
