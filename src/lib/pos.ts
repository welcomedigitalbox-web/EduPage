import { admin } from './supabase';

/**
 * Reads the POS tables that live in the same Supabase project.
 * Nothing here writes to POS master data — the bot may quote it, never edit it.
 */

export interface PosProduct {
  product_id: string;
  variant_id: string | null;
  display_name: string;
  sku: string | null;
  price: number;
  stock_qty: number;
  category: string | null;
}

/** Flattens products + variants + this store's stock into the sellable list,
 *  mirroring `fetchSellableItems` in the POS app. */
export async function fetchSellable(storeId: string, limit = 120): Promise<PosProduct[]> {
  const db = admin();

  const [{ data: products }, { data: variants }, { data: inv }, { data: cats }, { data: off }] =
    await Promise.all([
      db.from('products').select('id,name,sku,price,category_id,is_active').eq('is_active', true).order('name'),
      db.from('product_variants').select('id,product_id,variant_name,sku,price_override,is_active').eq('is_active', true),
      db.from('store_inventory').select('product_id,variant_id,stock_qty').eq('store_id', storeId),
      db.from('product_categories').select('id,name'),
      db.from('store_product_settings').select('product_id').eq('store_id', storeId).eq('is_available', false),
    ]);

  const key = (p: string, v: string | null) => `${p}:${v ?? 'base'}`;
  const stock = new Map((inv ?? []).map((i) => [key(i.product_id, i.variant_id), Number(i.stock_qty) || 0]));
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name as string]));
  const hidden = new Set((off ?? []).map((r) => r.product_id));

  const byProduct = new Map<string, typeof variants>();
  for (const v of variants ?? []) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(v);
    byProduct.set(v.product_id, list as typeof variants);
  }

  const out: PosProduct[] = [];
  for (const p of products ?? []) {
    if (hidden.has(p.id)) continue;
    const children = byProduct.get(p.id) ?? [];
    if (!children.length) {
      out.push({
        product_id: p.id, variant_id: null, display_name: p.name, sku: p.sku,
        price: Number(p.price) || 0, stock_qty: stock.get(key(p.id, null)) ?? 0,
        category: p.category_id ? catName.get(p.category_id) ?? null : null,
      });
      continue;
    }
    for (const v of children) {
      out.push({
        product_id: p.id, variant_id: v.id,
        display_name: `${p.name} (${v.variant_name})`,
        sku: v.sku ?? p.sku,
        price: Number(v.price_override ?? p.price) || 0,
        stock_qty: stock.get(key(p.id, v.id)) ?? 0,
        category: p.category_id ? catName.get(p.category_id) ?? null : null,
      });
    }
  }
  return out.slice(0, limit);
}

/** Find an existing POS customer by phone so a Messenger lead does not create
 *  a duplicate record for someone who already shops in-store. */
export async function findCustomerByPhone(phone: string, storeId: string) {
  const digits = phone.replace(/\D/g, '').slice(-9);
  if (digits.length < 7) return null;
  const { data } = await admin()
    .from('customers').select('id,name,phone,delivery_address,loyalty_tier_id')
    .eq('store_id', storeId).ilike('phone', `%${digits}`).limit(1).maybeSingle();
  return data;
}

export async function createCustomer(args: {
  name: string; phone: string | null; storeId: string; address: string | null; facebook?: string | null;
}) {
  const { data, error } = await admin().from('customers').insert({
    name: args.name, phone: args.phone, store_id: args.storeId,
    delivery_address: args.address, facebook: args.facebook ?? null,
  }).select('id').single();
  if (error) throw error;
  return data;
}

export interface OrderLine {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
}

/**
 * Creates a PENDING online order in the POS `sales` table.
 *
 * Deliberately does NOT deduct stock and does NOT call `checkout_sale`:
 *  - `checkout_sale` requires `auth.uid()`, which a webhook does not have
 *  - a Messenger order is not confirmed until a person packs it, and holding
 *    stock against unconfirmed chat orders would starve the shop floor
 * Staff complete it from the POS "Sale Order" page exactly like any other
 * online order, and that is where stock moves.
 */
export async function createPendingSale(args: {
  storeId: string;
  customerId: string | null;
  customerName: string | null;
  address: string | null;
  lines: OrderLine[];
  note?: string | null;
}) {
  const db = admin();
  const subtotal = args.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  const { data: sale, error } = await db.from('sales').insert({
    store_id: args.storeId,
    customer_id: args.customerId,
    customer_name: args.customerName,
    delivery_address: args.address,
    subtotal,
    total: subtotal,
    discount_type: 'flat',
    discount_value: 0,
    discount_amount: 0,
    vat_percent: 0,
    vat_amount: 0,
    amount_received: 0,
    change_amount: 0,
    advance_payment: 0,
    balance_due: subtotal,
    payment_method: 'cod',
    channel: 'messenger',
    order_status: 'pending',
    note: args.note ?? 'Messenger AI မှတစ်ဆင့် ဝင်လာသော order',
  }).select('id,sale_ref,total').single();
  if (error) throw error;

  if (args.lines.length) {
    const { error: itemsErr } = await db.from('sale_items').insert(
      args.lines.map((l) => ({
        sale_id: sale.id,
        product_id: l.product_id,
        variant_id: l.variant_id,
        product_name: l.product_name,
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: l.qty * l.unit_price,
      }))
    );
    // A sale with no lines is worse than no sale — roll it back rather than
    // leaving a phantom order in the POS.
    if (itemsErr) {
      await db.from('sales').delete().eq('id', sale.id);
      throw itemsErr;
    }
  }
  return sale;
}
