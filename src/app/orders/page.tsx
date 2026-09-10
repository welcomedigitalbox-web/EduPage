import Link from 'next/link';
import { orderList, shops, paymentChannels } from '@/lib/orders';
import { admin } from '@/lib/supabase';
import { ctx } from '@/lib/server-ctx';
import { money, num } from '@/components/ui';
import { resolveRange } from '@/lib/range';
import { RangePicker } from '@/components/RangePicker';
import { OrderFilters } from '@/components/OrderFilters';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  pending: 'border-warn text-warn',
  confirmed: 'border-[#3987e5] text-[#3987e5]',
  packed: 'border-[#3987e5] text-[#3987e5]',
  shipped: 'border-[#3987e5] text-[#3987e5]',
  delivered: 'border-good text-good',
  cancelled: 'border-bad text-bad',
};

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string; q?: string; shop?: string; by?: string; pay?: string; channel?: string;
    preset?: string; since?: string; until?: string;
  }>;
}) {
  const { t, lang } = await ctx();
  const sp = await searchParams;
  const r = resolveRange(sp);

  const [rows, shopList, channelList, staffRes] = await Promise.all([
    orderList({
      status: sp.status, q: sp.q,
      // A search is a hunt for one specific order, which is usually an old
      // one — so searching looks past the date window rather than through it.
      since: sp.q ? undefined : r.since,
      until: sp.q ? undefined : r.until,
      shop_id: sp.shop, created_by: sp.by,
      payment_method: sp.pay, payment_channel_id: sp.channel,
    }),
    shops(),
    paymentChannels({ all: true }),
    admin().from('msgr_users').select('id,name,email').order('name'),
  ]);

  const statuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  const payTerms = ['pending', 'cod', 'deposit', 'transfer'];

  // Cancelled orders are shown but never counted — a cancelled sale is not a sale.
  const live = rows.filter((o) => o.status !== 'cancelled');
  const total = live.reduce((a, o) => a + Number(o.grand_total ?? 0), 0);

  /** Keeps every other filter when a status chip is clicked. */
  const withStatus = (s: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'status') q.set(k, String(v));
    if (s) q.set('status', s);
    const qs = q.toString();
    return qs ? `/orders?${qs}` : '/orders';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('or2_title')}</h1>
          <p className="text-sm text-muted">{t('or2_sub')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link className="btn-primary" href="/orders/new">{t('or2_new')}</Link>
          <RangePicker
            preset={r.preset} since={r.since} until={r.until} compare={false}
            showCompare={false}
            labels={{
              today: t('rg_today'), yesterday: t('rg_yesterday'), d7: t('rg_7d'),
              d30: t('rg_30d'), d90: t('rg_90d'), month: t('rg_month'),
              lastMonth: t('rg_last_month'), custom: t('rg_custom'), apply: t('rg_apply'),
              compare: t('rg_compare'), from: t('rg_from'), to: t('rg_to'),
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={withStatus(null)}
          className={`btn text-xs ${!sp.status ? 'border-brand text-brand' : ''}`}>
          {t('or2_all_status')}
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={withStatus(s)}
            className={`btn text-xs ${sp.status === s ? 'border-brand text-brand' : ''}`}>
            {t(`os_${s}`)}
          </Link>
        ))}
      </div>

      <OrderFilters
        shops={shopList.map((s) => ({ value: s.id as string, label: s.name as string }))}
        staff={(staffRes.data ?? []).map((u) => ({
          value: u.id as string, label: (u.name as string) || (u.email as string),
        }))}
        payments={payTerms.map((p) => ({ value: p, label: t(`or2_${p}`) }))}
        channels={channelList.map((c) => ({ value: c.id as string, label: c.name as string }))}
        labels={{
          shop: t('or2_shop'), anyShop: t('or2_any_shop'),
          staff: t('or2_by'), anyStaff: t('or2_any_staff'),
          payment: t('or2_payment'), anyPayment: t('or2_any_payment'),
          channel: t('or2_channel'), anyChannel: t('or2_any_channel'),
          search: t('or2_search_ph'), clear: t('or2_clear'),
        }}
      />

      <div className="text-sm text-muted">
        {t('or2_summary', { n: live.length, v: total.toLocaleString() })}
        {!sp.q && <span className="ml-2 text-xs">{r.since} → {r.until}</span>}
      </div>

      {/* Phones get one block per order; the nine-column table starts at md. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((o) => {
          const shop = (o.msgr_shops as { name?: string } | null)?.name;
          const advance = Number(o.advance_payment ?? 0);
          return (
            <li key={o.id as string}>
              <Link href={`/orders/${o.id}`}
                className="card block space-y-1 p-3 hover:border-brand">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">EBH-{String(o.order_no).padStart(5, '0')}</span>
                  <span className="tabular-nums">{money(Number(o.grand_total))}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{o.customer_name as string}</span>
                  <span className="text-xs text-muted">{(o.phone as string) ?? '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className={`rounded border px-1.5 py-0.5 ${STATUS_TONE[o.status as string] ?? 'border-edge'}`}>
                    {t(`os_${o.status}`)}
                  </span>
                  <span>{shop ?? '—'}</span>
                  <span>{t(`or2_${o.payment_method}`)}{advance > 0 ? ` · ${advance.toLocaleString()}` : ''}</span>
                  <span className="ml-auto">
                    {new Date(`${o.order_date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM')}
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  {(o.created_by_name as string) || t('or2_bot_created')}
                </div>
              </Link>
            </li>
          );
        })}
        {!rows.length && (
          <li className="card p-8 text-center text-muted">{t('or2_none')}</li>
        )}
      </ul>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('or2_ref')}</th>
              <th className="p-3 text-left font-normal">{t('or2_customer')}</th>
              <th className="p-3 text-left font-normal">{t('or2_shop')}</th>
              <th className="p-3 text-left font-normal">{t('or2_payment')}</th>
              <th className="p-3 text-left font-normal">{t('or2_by')}</th>
              <th className="p-3 text-left font-normal">{t('or2_source')}</th>
              <th className="p-3 text-left font-normal">{t('or2_status')}</th>
              <th className="p-3 text-left font-normal">{t('or2_date')}</th>
              <th className="p-3 text-right font-normal">{t('or2_total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const shop = (o.msgr_shops as { name?: string } | null)?.name;
              const channel = (o.msgr_payment_channels as { name?: string } | null)?.name;
              const items = (o.msgr_order_items as unknown[] | null)?.length ?? 0;
              const advance = Number(o.advance_payment ?? 0);
              return (
                <tr key={o.id as string} className="border-b border-edge/50 last:border-0 hover:bg-edge/30">
                  <td className="p-3">
                    <Link href={`/orders/${o.id}`} className="hover:text-brand">
                      EBH-{String(o.order_no).padStart(5, '0')}
                    </Link>
                    <div className="text-[11px] text-muted">{num(items)} ×</div>
                  </td>
                  <td className="p-3">
                    <Link href={`/orders/${o.id}`} className="hover:text-brand">
                      {o.customer_name as string}
                    </Link>
                    <div className="text-[11px] text-muted">{(o.phone as string) ?? '—'}</div>
                  </td>
                  <td className="p-3 text-xs text-muted">{shop ?? '—'}</td>
                  <td className="p-3 text-xs">
                    <div>{t(`or2_${o.payment_method}`)}</div>
                    <div className="text-[11px] text-muted">
                      {channel ?? (advance > 0 ? '—' : '')}
                      {advance > 0 && ` · ${advance.toLocaleString()}`}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {(o.created_by_name as string) || t('or2_bot_created')}
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {o.source_ad_id ? `ad · ${String(o.source_ad_id).slice(-6)}` : (o.source_type as string) ?? 'organic'}
                  </td>
                  <td className="p-3">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${STATUS_TONE[o.status as string] ?? 'border-edge text-muted'}`}>
                      {t(`os_${o.status}`)}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {new Date(`${o.order_date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM')}
                  </td>
                  <td className="p-3 text-right tabular-nums">{money(Number(o.grand_total))}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={9} className="p-8 text-center text-muted">{t('or2_none')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
