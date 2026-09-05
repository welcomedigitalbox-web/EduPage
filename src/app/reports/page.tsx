import { salesReport } from '@/lib/queries';
import { getSettings } from '@/lib/crm';
import { ctx } from '@/lib/server-ctx';
import { resolveRange, delta } from '@/lib/range';
import { RangePicker } from '@/components/RangePicker';
import { Stat, BarChart, money, num } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string; since?: string; until?: string; compare?: string; days?: string;
  }>;
}) {
  const { t } = await ctx();
  const r = resolveRange(await searchParams);
  const settings = await getSettings();
  const cur = settings.ad_currency || 'USD';

  const [rep, prev] = await Promise.all([
    salesReport(r.since, r.until),
    r.compare ? salesReport(r.prevSince, r.prevUntil) : Promise.resolve(null),
  ]);

  const d = (pick: (x: NonNullable<typeof prev>) => number | null) =>
    prev ? delta(Number(pick(rep) ?? 0), Number(pick(prev) ?? 0)) : undefined;

  const pending = rep.byStatus.find((s) => s.status === 'pending');
  const done = rep.byStatus.filter((s) => s.status !== 'pending')
    .reduce((a, s) => ({ orders: a.orders + s.orders, revenue: a.revenue + s.revenue }),
            { orders: 0, revenue: 0 });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('sr_title')}</h1>
          <p className="text-sm text-muted">
            {r.since === r.until ? r.since : `${r.since} → ${r.until}`}
            {prev && ` · ${t('rg_vs', { a: r.prevSince, b: r.prevUntil })}`}
          </p>
        </div>
        <RangePicker
          preset={r.preset} since={r.since} until={r.until} compare={r.compare}
          labels={{
            today: t('rg_today'), yesterday: t('rg_yesterday'), d7: t('rg_7d'),
            d30: t('rg_30d'), d90: t('rg_90d'), month: t('rg_month'),
            lastMonth: t('rg_last_month'), custom: t('rg_custom'), apply: t('rg_apply'),
            compare: t('rg_compare'), from: t('rg_from'), to: t('rg_to'),
          }}
        />
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('sr_orders')} value={num(rep.orders)} delta={d((x) => x.orders)}
              prev={prev ? t('rg_prev', { v: num(prev.orders) }) : undefined} />
        <Stat label={t('sr_revenue')} value={money(rep.revenue)}
              sub={money(rep.revenueUsd, cur, 2)} delta={d((x) => x.revenue)}
              prev={prev ? t('rg_prev', { v: money(prev.revenue) }) : undefined} />
        <Stat label={t('sr_aov')} value={money(rep.aov)} delta={d((x) => x.aov)} />
        <Stat label={t('sr_from_ads')} value={num(rep.fromAds.orders)}
              sub={money(rep.fromAds.revenue)}
              delta={d((x) => x.fromAds.orders)} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('sr_pending')} value={num(pending?.orders ?? 0)}
              sub={money(pending?.revenue ?? 0)} tone={pending?.orders ? 'warn' : undefined} />
        <Stat label={t('sr_done')} value={num(done.orders)} sub={money(done.revenue)} tone="good" />
      </section>

      {rep.byDay.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="label mb-3">{t('sr_chart_orders')}</div>
            <BarChart data={rep.byDay.map((x) => ({ label: x.day.slice(5), value: x.orders }))}
                      color="var(--series-3)" />
          </div>
          <div className="card p-4">
            <div className="label mb-3">{t('sr_chart_revenue')}</div>
            <BarChart data={rep.byDay.map((x) => ({ label: x.day.slice(5), value: x.revenue }))}
                      color="var(--series-1)"
                      format={(n) => Math.round(n).toLocaleString()} />
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="label p-3">{t('sr_by_store')}</div>
          <Table
            head={[t('sr_store'), t('sr_orders'), t('sr_revenue')]}
            rows={rep.byStore.map((s) => [s.store_name, num(s.orders), money(s.revenue)])}
            empty={t('sr_empty')}
          />
        </div>
        <div className="card overflow-x-auto">
          <div className="label p-3">{t('sr_by_status')}</div>
          <Table
            head={[t('sr_status'), t('sr_orders'), t('sr_revenue')]}
            rows={rep.byStatus.map((s) => [s.status, num(s.orders), money(s.revenue)])}
            empty={t('sr_empty')}
          />
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="label p-3">{t('sr_top_products')}</div>
        <Table
          head={[t('sr_product'), t('sr_qty'), t('sr_revenue')]}
          rows={rep.topProducts.map((p) => [p.name, num(p.qty), money(p.revenue)])}
          empty={t('sr_empty')}
        />
      </section>

      <section className="card overflow-x-auto">
        <div className="label p-3">{t('sr_by_day')}</div>
        <Table
          head={[t('sr_day'), t('sr_orders'), t('sr_revenue')]}
          rows={[...rep.byDay].reverse().map((x) => [x.day, num(x.orders), money(x.revenue)])}
          empty={t('sr_empty')}
        />
      </section>
    </div>
  );
}

function Table({
  head, rows, empty,
}: { head: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-muted">
        <tr className="border-b border-edge">
          {head.map((h, i) => (
            <th key={h} className={`p-3 font-normal ${i ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-edge/50 last:border-0">
            {row.map((cell, j) => (
              <td key={j} className={`p-3 ${j ? 'text-right' : 'text-left'}`}>{cell}</td>
            ))}
          </tr>
        ))}
        {!rows.length && (
          <tr><td colSpan={head.length} className="p-6 text-center text-muted">{empty}</td></tr>
        )}
      </tbody>
    </table>
  );
}
