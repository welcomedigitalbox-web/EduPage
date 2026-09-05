import { admin } from '@/lib/supabase';
import { ctx } from '@/lib/server-ctx';
import { Stat, BarChart, num } from '@/components/ui';
import { costUsd, costWithoutCacheUsd, type UsageRow } from '@/lib/ai-cost';

export const dynamic = 'force-dynamic';

interface DayRow extends UsageRow {
  day: string;
  handoffs: number;
  avg_latency_ms: number;
}

export default async function Usage() {
  const { t } = await ctx();
  const { data } = await admin()
    .from('v_msgr_ai_usage_daily').select('*').order('day', { ascending: false }).limit(120);
  const rows = (data ?? []) as DayRow[];

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' });
  const monthPrefix = today.slice(0, 7);
  const month = rows.filter((r) => r.day.startsWith(monthPrefix));

  const sum = (rs: DayRow[]) => ({
    runs: rs.reduce((a, r) => a + Number(r.runs), 0),
    handoffs: rs.reduce((a, r) => a + Number(r.handoffs), 0),
    usd: rs.reduce((a, r) => a + costUsd(r), 0),
    usdNoCache: rs.reduce((a, r) => a + costWithoutCacheUsd(r), 0),
  });
  const m = sum(month);
  const d = sum(rows.filter((r) => r.day === today));
  const perReply = m.runs ? m.usd / m.runs : 0;
  const saved = m.usdNoCache - m.usd;

  // One bar per day, newest last so the chart reads left to right. Cents,
  // because a day's spend rounded to whole dollars is mostly zeroes.
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + costUsd(r));
  const chart = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
    .map(([day, v]) => ({ label: day.slice(5), value: Number((v * 100).toFixed(1)) }));

  /** Small amounts need more decimals than large ones to say anything. */
  const usd = (n: number) =>
    n === 0 ? '$0'
    : n < 0.01 ? `$${n.toFixed(4)}`
    : n < 1 ? `$${n.toFixed(3)}`
    : `$${n.toFixed(2)}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('us_ai_title')}</h1>
        <p className="text-sm text-muted">{t('us_ai_sub')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('us_ai_month_cost')} value={usd(m.usd)} sub={t('us_ai_runs_n', { n: m.runs })} />
        <Stat label={t('us_ai_today_cost')} value={usd(d.usd)} sub={t('us_ai_runs_n', { n: d.runs })} />
        <Stat label={t('us_ai_per_reply')} value={usd(perReply)} sub={t('us_ai_per_reply_sub')} />
        <Stat label={t('us_ai_saved')} value={usd(saved)} sub={t('us_ai_saved_sub')} />
      </div>

      {chart.length > 0 && (
        <div className="card p-4">
          <div className="label mb-3">{t('us_ai_chart')}</div>
          <BarChart data={chart} />
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('us_ai_day')}</th>
              <th className="p-3 text-left font-normal">{t('us_ai_model')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_replies')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_handoffs')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_in')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_cached')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_out')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_latency')}</th>
              <th className="p-3 text-right font-normal">{t('us_ai_cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.day}-${r.model}`} className="border-b border-edge/50 last:border-0">
                <td className="p-3">{r.day}</td>
                <td className="p-3 text-muted">{r.model}</td>
                <td className="p-3 text-right tabular-nums">{num(Number(r.runs))}</td>
                <td className="p-3 text-right tabular-nums text-muted">{num(Number(r.handoffs))}</td>
                <td className="p-3 text-right tabular-nums text-muted">{num(Number(r.input_tokens))}</td>
                <td className="p-3 text-right tabular-nums text-muted">{num(Number(r.cache_read_tokens))}</td>
                <td className="p-3 text-right tabular-nums text-muted">{num(Number(r.output_tokens))}</td>
                <td className="p-3 text-right tabular-nums text-muted">{num(Number(r.avg_latency_ms))} ms</td>
                <td className="p-3 text-right tabular-nums">{usd(costUsd(r))}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} className="p-6 text-center text-muted">{t('us_ai_empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
