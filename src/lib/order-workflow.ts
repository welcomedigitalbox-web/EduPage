import type { Role } from './session';

/** Both tracks move in one direction only. An agent may take the next step;
 *  undoing one is a manager's decision, because it usually means money or
 *  stock moved in the real world and has to move back. */
export const TRACK = ['pending', 'processing', 'done'] as const;
export type TrackState = (typeof TRACK)[number];
export type TrackName = 'payment' | 'delivery';

export function stepIndex(s: string): number {
  const i = TRACK.indexOf(s as TrackState);
  return i < 0 ? 0 : i;
}

export function canSetTrack(role: Role, from: string, to: string): boolean {
  if (!TRACK.includes(to as TrackState)) return false;
  if (role === 'manager') return true;
  return stepIndex(to) === stepIndex(from) + 1;
}

/** An order whose money is in is not the agents' to remove any more. */
export function canDelete(role: Role, o: { payment_status?: string | null }): boolean {
  return role === 'manager' && (o.payment_status ?? 'pending') !== 'done';
}

export function canEdit(role: Role, o: { payment_status?: string | null }): boolean {
  return role === 'manager' || (o.payment_status ?? 'pending') !== 'done';
}

export function canCancel(role: Role): boolean {
  return role === 'manager';
}

/** The reports still read one `status` column, so it is derived from the two
 *  tracks rather than kept by hand — two people editing two fields can never
 *  leave them disagreeing. Cancelled is set by a manager and stays put. */
export function deriveStatus(
  payment: string, delivery: string, current?: string | null
): string {
  if (current === 'cancelled') return 'cancelled';
  if (delivery === 'done') return 'delivered';
  if (delivery === 'processing') return 'shipped';
  if (payment === 'done') return 'confirmed';
  if (payment === 'processing') return 'confirmed';
  return 'pending';
}
