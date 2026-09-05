/**
 * Date ranges for the reports. Everything is computed in the shop's own
 * timezone — a "today" that starts at UTC midnight is 6.5 hours wrong in
 * Yangon and would put the morning's orders on yesterday.
 */
export const TZ = 'Asia/Yangon';

export type Preset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'last_month' | 'custom';

/** YYYY-MM-DD for a Date, read in the shop's timezone. */
export function localDay(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function shiftDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000
  ) + 1;
}

export interface Range {
  preset: Preset;
  since: string;
  until: string;
  /** The equally long stretch immediately before, for comparison. */
  prevSince: string;
  prevUntil: string;
  days: number;
  compare: boolean;
}

export function resolveRange(sp: {
  preset?: string; since?: string; until?: string; compare?: string; days?: string;
}): Range {
  const today = localDay(new Date());
  // `days=30` links from the old dashboard still work.
  const preset = (sp.preset
    ?? (sp.since || sp.until ? 'custom' : sp.days ? `${sp.days}d` : '30d')) as Preset;

  let since = today;
  let until = today;

  switch (preset) {
    case 'today': break;
    case 'yesterday':
      since = until = shiftDays(today, -1);
      break;
    case 'month':
      since = `${today.slice(0, 7)}-01`;
      break;
    case 'last_month': {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      until = shiftDays(firstOfThis, -1);
      since = `${until.slice(0, 7)}-01`;
      break;
    }
    case 'custom':
      since = sp.since || shiftDays(today, -29);
      until = sp.until || today;
      if (since > until) [since, until] = [until, since];
      break;
    default: {
      const n = Number(String(preset).replace('d', '')) || 30;
      since = shiftDays(today, -(n - 1));
    }
  }

  const days = daysBetween(since, until);
  return {
    preset,
    since,
    until,
    prevUntil: shiftDays(since, -1),
    prevSince: shiftDays(since, -days),
    days,
    compare: sp.compare !== '0',
  };
}

/** Start/end as ISO instants, for columns that store a timestamp. */
export function instants(since: string, until: string) {
  // Yangon is UTC+6:30 year round, so the day boundary is a fixed offset.
  return {
    from: `${since}T00:00:00+06:30`,
    to: `${until}T23:59:59.999+06:30`,
  };
}

/** Percentage change, or null when there is nothing to compare against. */
export function delta(now: number, before: number): number | null {
  if (!before) return now ? null : 0;
  return ((now - before) / before) * 100;
}
