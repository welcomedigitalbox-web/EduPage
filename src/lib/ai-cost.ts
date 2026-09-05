/**
 * Anthropic list prices, USD per 1M tokens. Kept here rather than in the
 * database because they change rarely and a wrong figure in a settings box is
 * worse than a wrong figure in a reviewed file.
 */
export interface Price { in: number; out: number; cacheWrite: number; cacheRead: number }

const PRICES: { match: RegExp; price: Price }[] = [
  { match: /opus/i,   price: { in: 15, out: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: /haiku/i,  price: { in: 1,  out: 5,  cacheWrite: 1.25,  cacheRead: 0.1 } },
  { match: /sonnet/i, price: { in: 3,  out: 15, cacheWrite: 3.75,  cacheRead: 0.3 } },
];
const FALLBACK: Price = { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 };

export function priceFor(model: string): Price {
  return PRICES.find((p) => p.match.test(model))?.price ?? FALLBACK;
}

export interface UsageRow {
  model: string;
  runs: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/** USD for one aggregated row. */
export function costUsd(r: UsageRow): number {
  const p = priceFor(r.model);
  return (
    (Number(r.input_tokens) * p.in +
      Number(r.output_tokens) * p.out +
      Number(r.cache_write_tokens) * p.cacheWrite +
      Number(r.cache_read_tokens) * p.cacheRead) / 1_000_000
  );
}

/** What the same traffic would have cost with caching switched off — the
 *  number that justifies keeping it on. */
export function costWithoutCacheUsd(r: UsageRow): number {
  const p = priceFor(r.model);
  const asPlainInput = Number(r.input_tokens) + Number(r.cache_read_tokens) + Number(r.cache_write_tokens);
  return (asPlainInput * p.in + Number(r.output_tokens) * p.out) / 1_000_000;
}
