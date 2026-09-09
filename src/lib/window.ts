/**
 * Meta's standard messaging window: a Page may reply for 24 hours after the
 * customer's last message, and not a minute longer. Nothing in the code can
 * widen it, so the job here is to make the deadline visible before someone
 * types a reply they cannot send.
 */
export const WINDOW_HOURS = 24;

export interface WindowState {
  open: boolean;
  /** Hours left, rounded down; 0 when it has closed. */
  hoursLeft: number;
  minutesLeft: number;
  /** Under three hours — worth flagging in the list. */
  closing: boolean;
}

export function messageWindow(lastInboundAt: string | null | undefined): WindowState {
  if (!lastInboundAt) return { open: false, hoursLeft: 0, minutesLeft: 0, closing: false };
  const msLeft = Date.parse(lastInboundAt) + WINDOW_HOURS * 3600_000 - Date.now();
  if (msLeft <= 0) return { open: false, hoursLeft: 0, minutesLeft: 0, closing: false };
  const minutes = Math.floor(msLeft / 60_000);
  return {
    open: true,
    hoursLeft: Math.floor(minutes / 60),
    minutesLeft: minutes % 60,
    closing: minutes < 180,
  };
}

/** Meta's error for "outside the allowed window" — code 10, subcode 2018278. */
export function isWindowError(e: unknown): boolean {
  const s = String(e);
  return s.includes('outside the allowed window') || s.includes('2018278');
}
