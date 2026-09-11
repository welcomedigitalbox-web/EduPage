/** The rules for what a valid order looks like — written once and imported by
 *  both the form and the API route, because a rule that only the browser
 *  enforces is not a rule. */

// 'pending' is for an order taken before the customer has said how they will
// pay — it takes no money, so it behaves like COD until someone changes it.
export const PAYMENT_METHODS = ['pending', 'cod', 'deposit', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface RuleLine {
  description: string; unit_price: number | ''; qty: number | '';
}

export interface RuleInput {
  customer_name?: string;
  phone?: string | null;
  shop_id?: string | null;
  order_date?: string;
  payment_method?: string;
  payment_channel_id?: string | null;
  payment_slip_url?: string | null;
  sales_person_id?: string | null;
  advance_payment?: number;
  discount?: number;
  delivery_fee?: number;
  items: RuleLine[];
}

/** Myanmar mobile numbers arrive as 09…, +959…, 959… and with spaces or
 *  dashes in them. They are stored one way so search and dedupe can work. */
export function normalizePhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/[^\d+]/g, '');
  if (!d) return '';
  let n = d.replace(/^\+/, '');
  if (n.startsWith('959')) n = '0' + n.slice(2);
  else if (n.startsWith('9') && !n.startsWith('09')) n = '0' + n;
  return n;
}

export function phoneLooksValid(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  if (!n) return true;                       // optional field
  return /^09\d{7,9}$/.test(n);
}

export function orderMoney(input: RuleInput) {
  const subtotal = (input.items ?? []).reduce(
    (a, l) => a + Number(l.unit_price || 0) * Number(l.qty || 0), 0
  );
  const discount = Number(input.discount || 0);
  const delivery = Number(input.delivery_fee || 0);
  const grand_total = Math.max(0, subtotal - discount + delivery);
  const advance = Number(input.advance_payment || 0);
  return { subtotal, discount, delivery, grand_total, advance, cod_due: Math.max(0, grand_total - advance) };
}

/** What the advance *must* be for a given payment method, or null when the
 *  method leaves it up to the person taking the order. */
export function requiredAdvance(method: string, grand_total: number): number | null {
  if (method === 'pending' || method === 'cod') return 0;
  if (method === 'transfer') return grand_total;
  return null;                                // deposit: any partial amount
}

export type FieldKey =
  | 'customer_name' | 'phone' | 'shop_id' | 'order_date'
  | 'items' | 'discount' | 'delivery_fee' | 'advance_payment' | 'payment_channel_id'
  | 'payment_slip_url' | 'sales_person_id';

/** Returns a message key per offending field. The caller maps keys to text so
 *  the same rules can speak Burmese in the form and English in the log. */
export function validateOrder(input: RuleInput): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const m = orderMoney(input);

  if (!input.customer_name?.trim()) e.customer_name = 'required';
  if (!phoneLooksValid(input.phone)) e.phone = 'bad_phone';
  if (!input.shop_id) e.shop_id = 'required';

  const lines = (input.items ?? []).filter((l) => l.description?.trim());
  if (!lines.length) e.items = 'no_lines';
  else if (lines.some((l) => Number(l.qty || 0) <= 0)) e.items = 'bad_qty';
  else if (lines.some((l) => Number(l.unit_price || 0) < 0)) e.items = 'bad_price';
  else if (m.subtotal <= 0) e.items = 'zero_total';

  if (m.discount < 0) e.discount = 'negative';
  else if (m.discount > m.subtotal) e.discount = 'over_subtotal';
  if (m.delivery < 0) e.delivery_fee = 'negative';

  const method = input.payment_method || 'cod';
  const need = requiredAdvance(method, m.grand_total);
  if (m.advance < 0) e.advance_payment = 'negative';
  else if (m.advance > m.grand_total) e.advance_payment = 'over_total';
  else if (need !== null && Math.abs(m.advance - need) > 0.005) {
    e.advance_payment = method === 'transfer' ? 'transfer_full' : 'cod_no_advance';
  } else if (need === null && m.advance <= 0) {
    e.advance_payment = 'deposit_required';
  }

  // Money that has already arrived came through *something*, and finance
  // cannot reconcile a deposit that names no wallet.
  if (m.advance > 0 && !input.payment_channel_id) e.payment_channel_id = 'channel_required';
  // Money that arrived by transfer has a slip. Without it nobody can prove the
  // transfer happened, and "the customer said they sent it" is not proof.
  if (m.advance > 0 && !input.payment_slip_url) e.payment_slip_url = 'slip_required';

  if (!input.sales_person_id) e.sales_person_id = 'seller_required';

  if (input.order_date) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' });
    if (input.order_date > today) e.order_date = 'future';
  }

  return e;
}
