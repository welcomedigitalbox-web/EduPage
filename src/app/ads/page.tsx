import { adPerformance } from '@/lib/queries';
import { money, num } from '@/components/ui';
import { ctx } from '@/lib/server-ctx';

export const dynamic = 'force-dynamic';

export default async function Ads() {
  const { t } = await ctx();
  const rows = await adPerformance();
  const total = rows.reduce(
    (a, r) => ({
      spend: a.spend + Number(r.spend ?? 0),
      leads: a.leads + Number(r.leads ?? 0),
      orders: a.orders + Number(r.orders ?? 0),
      revenue: a.revenue + Number(r.revenue ?? 0),
    }),
    { spend: 0, leads: 0, orders: 0, revenue: 0 }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('ad_title')}</h1>
        <p className="text-sm text-muted">{t('ad_sub')}</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('ad_ad')}</th>
              <th className="p-3 text-right font-normal">{t('ad_spend')}</th>
              <th className="p-3 text-right font-normal">{t('ad_meta_chat')}</th>
              <th className="p-3 text-right font-normal">{t('ad_leads')}</th>
              <th className="p-3 text-right font-normal">{t('ad_qualified')}</th>
              <th className="p-3 text-right font-normal">{t('ad_orders')}</th>
              <th className="p-3 text-right font-normal">{t('ad_revenue')}</th>
              <th className="p-3 text-right font-normal">CPL</th>
              <th className="p-3 text-right font-normal">CPA</th>
              <th className="p-3 text-right font-normal">ROAS</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => {
              const roas = r.roas != null ? Number(r.roas) : null;
              const tone = roas == null ? '' : roas >= 2 ? 'text-good' : roas >= 1 ? 'text-warn' : 'text-bad';
              return (
                <tr key={r.ad_id} className="border-b border-edge/60">
                  <td className="p-3">
                    <div className="max-w-[18rem] truncate">{r.ad_name ?? r.ad_id}</div>
                    <div className="max-w-[18rem] truncate text-xs text-muted">{r.campaign_name ?? ''}</div>
                  </td>
                  <td className="p-3 text-right">{money(Number(r.spend))}</td>
                  <td className="p-3 text-right">{num(Number(r.meta_conversations))}</td>
                  <td className="p-3 text-right">{num(Number(r.leads))}</td>
                  <td className="p-3 text-right">{num(Number(r.qualified_leads))}</td>
                  <td className="p-3 text-right">{num(Number(r.orders))}</td>
                  <td className="p-3 text-right">{money(Number(r.revenue))}</td>
                  <td className="p-3 text-right">{r.cost_per_lead != null ? money(Number(r.cost_per_lead)) : '—'}</td>
                  <td className="p-3 text-right">{r.cost_per_order != null ? money(Number(r.cost_per_order)) : '—'}</td>
                  <td className={`p-3 text-right font-medium ${tone}`}>{roas != null ? `${roas.toFixed(2)}x` : '—'}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={10} className="p-8 text-center text-muted">{t('ad_empty')}</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-edge text-sm font-medium tabular-nums">
              <tr>
                <td className="p-3">{t('ad_total')}</td>
                <td className="p-3 text-right">{money(total.spend)}</td>
                <td className="p-3" />
                <td className="p-3 text-right">{num(total.leads)}</td>
                <td className="p-3" />
                <td className="p-3 text-right">{num(total.orders)}</td>
                <td className="p-3 text-right">{money(total.revenue)}</td>
                <td className="p-3 text-right">{total.leads ? money(total.spend / total.leads) : '—'}</td>
                <td className="p-3 text-right">{total.orders ? money(total.spend / total.orders) : '—'}</td>
                <td className="p-3 text-right">{total.spend ? `${(total.revenue / total.spend).toFixed(2)}x` : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-muted">{t('ad_footnote')}</p>
    </div>
  );
}
