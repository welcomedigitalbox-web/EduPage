import { overview, dailyFunnel, stageCounts } from '@/lib/queries';
import { Stat, BarChart, Funnel, money, num } from '@/components/ui';
import { ctx } from '@/lib/server-ctx';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Overview({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const { t } = await ctx();
  const sp = await searchParams;
  const days = Number(sp.days ?? 30);

  const [o, daily, stages] = await Promise.all([
    overview(days), dailyFunnel(days), stageCounts(days),
  ]);

  const short = (d: string) => d.slice(5);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('ov_title')}</h1>
          <p className="text-sm text-muted">{t('ov_last_days', { n: days })}</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/?days=${d}`}
              className={`btn ${d === days ? 'border-brand text-brand' : ''}`}>
              {t('ov_days', { n: d })}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('ov_leads')} value={num(o.leads)} sub={t('ov_leads_sub')} />
        <Stat label={t('ov_engaged')} value={num(o.engaged)} sub={t('ov_engaged_sub')} />
        <Stat label={t('ov_noconvo')} value={num(o.noConvo)} tone="warn" sub={t('ov_noconvo_sub')} />
        <Stat label={t('ov_won')} value={num(o.orders)} tone="good"
              sub={o.convRate != null ? t('ov_conv_rate', { n: o.convRate.toFixed(1) }) : undefined} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('ov_spend')} value={money(o.spend)} />
        <Stat label={t('ov_cpl')} value={money(o.costPerLead)} />
        <Stat label={t('ov_cpa')} value={money(o.costPerOrder)}
              tone={o.costPerOrder && o.revenue / Math.max(o.orders, 1) < o.costPerOrder ? 'bad' : undefined} />
        <Stat label={t('ov_roas')} value={o.roas != null ? `${o.roas.toFixed(2)}x` : '—'}
              tone={o.roas == null ? undefined : o.roas >= 2 ? 'good' : o.roas >= 1 ? 'warn' : 'bad'}
              sub={t('ov_revenue', { v: money(o.revenue) })} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('ov_bot_handled')} value={num(o.botHandled)} />
        <Stat label={t('ov_needs_human')} value={num(o.needsHuman)} tone={o.needsHuman ? 'warn' : 'good'} />
        <Stat label={t('ov_tasks')} value={num(o.pendingTasks)} tone={o.pendingTasks ? 'warn' : 'good'} />
        <Stat label={t('ov_auto_rate')}
              value={o.autoRate != null ? `${o.autoRate.toFixed(0)}%` : '—'}
              sub={t('ov_auto_sub', { a: num(o.aiReplies), b: num(o.aiHandoffs) })} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="label mb-3">{t('ov_chart_leads')}</div>
          <BarChart data={daily.map((d) => ({ label: short(d.day), value: d.new_contacts }))}
                    color="var(--series-1)" />
        </div>
        <div className="card p-4">
          <div className="label mb-3">{t('ov_chart_spend')}</div>
          <BarChart data={daily.map((d) => ({ label: short(d.day), value: Number(d.spend) }))}
                    color="var(--series-2)" format={(n) => Math.round(n).toLocaleString()} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="label mb-3">{t('ov_funnel', { n: days })}</div>
          <Funnel steps={[
            { label: t('st_new'), value: stages.new ?? 0 },
            { label: t('st_engaged'), value: stages.engaged ?? 0 },
            { label: t('st_qualified'), value: stages.qualified ?? 0 },
            { label: t('st_negotiating'), value: stages.negotiating ?? 0 },
            { label: t('st_ordered'), value: stages.ordered ?? 0 },
            { label: t('st_won'), value: stages.won ?? 0 },
          ]} />
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span>{t('ov_lost')}: {stages.lost ?? 0}</span>
            <span>{t('ov_ghosted')}: {stages.ghosted ?? 0}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="label mb-3">{t('ov_chart_orders')}</div>
          <BarChart data={daily.map((d) => ({ label: short(d.day), value: Number(d.orders) }))}
                    color="var(--series-3)" />
          <table className="mt-4 w-full text-xs">
            <thead className="text-muted">
              <tr>
                <th className="text-left font-normal">{t('ov_col_day')}</th>
                <th className="text-right font-normal">{t('ov_col_lead')}</th>
                <th className="text-right font-normal">{t('ov_col_orders')}</th>
                <th className="text-right font-normal">{t('ov_col_spend')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {daily.slice(-7).reverse().map((d) => (
                <tr key={d.day} className="border-t border-edge">
                  <td className="py-1">{d.day}</td>
                  <td className="text-right">{d.new_contacts}</td>
                  <td className="text-right">{d.orders}</td>
                  <td className="text-right">{Math.round(Number(d.spend)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
