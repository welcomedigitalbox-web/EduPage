/** Paid, part-paid or unpaid — read off the money, never set by hand. */
export type PaymentState = 'unpaid' | 'partial' | 'paid';

export function paymentState(grandTotal: number, received: number): PaymentState {
  const total = Number(grandTotal || 0);
  const got = Number(received || 0);
  // A rounding-sized shortfall is not an unpaid order.
  if (got >= total - 0.5 && total > 0) return 'paid';
  return got > 0 ? 'partial' : 'unpaid';
}

/** The two-track workflow still wants a payment state; this keeps the rail and
 *  the money from ever disagreeing. */
export function paymentTrackFor(state: PaymentState): 'pending' | 'processing' | 'done' {
  return state === 'paid' ? 'done' : state === 'partial' ? 'processing' : 'pending';
}

export function balanceDue(grandTotal: number, received: number): number {
  return Math.max(0, Number(grandTotal || 0) - Number(received || 0));
}
