import Link from 'next/link';
import {
  orderList, orderTotals, shops, paymentChannels, salesPeople, orderChannels,
} from '@/lib/orders';
import { msgrStaff } from '@/lib/staff';
import { ctx } from '@/lib/server-ctx';
import { money, num } from '@/components/ui';
import { paymentState, balanceDue } from '@/lib/order-payment';
import { Pager } from '@/components/SortHeader';
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
    seller?: string; src?: string; paid?: string; sale_type?: string; page?: string;
    preset?: string; since?: string; until?: string;
  }>;
}) {
  const { t, lang } = await ctx();
  const sp = await searchParams;
  const r = resolveRange(sp);

  const PER_PAGE = 50;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const filters = {
    status: sp.status, q: sp.q,
    since: sp.q ? undefined : r.since,
    until: sp.q ? undefined : r.until,
    shop_id: sp.shop, created_by: sp.by,
    payment_method: sp.pay, payment_channel_id: sp.channel,
    seller: sp.seller, src: sp.src, paid: sp.paid, sale_type: sp.sale_type,
  };

  const [listed, sums, shopList, channelList, sellerList, srcList, staff] = await Promise.all([
    orderList({ ...filters, page, perPage: PER_PAGE }),
    orderTotals(filters),
    shops(),
    paymentChannels({ all: true }),
    salesPeople({ all: true }),
    orderChannels({ all: true }),
    msgrStaff(),
  ]);

  const statuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  const payTerms = ['pending', 'cod', 'deposit', 'transfer'];

  const rows = listed.rows;
  const pages = Math.max(1, Math.ceil(listed.total / PER_PAGE));


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('or2_title')}</h1>
          <p className="text-sm text-muted">{t('or2_sub')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <a className="btn text-sm"
               href={`/api/online-orders/export?${new URLSearchParams(
                 Object.entries(sp).filter(([, v]) => v).map(([k, v]) => [k, String(v)])
               ).toString()}&since=${r.since}&until=${r.until}`}>
              {t('or2_export')}
            </a>
            <Link className="btn text-sm" href="/orders/settle">{t('st_link')}</Link>
            <Link className="btn-primary" href="/orders/new">{t('or2_new')}</Link>
          </div>
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

      <OrderFilters
        statuses={statuses.map((x) => ({ value: x, label: t(`os_${x}`) }))}
        shops={shopList.map((s) => ({ value: s.id as string, label: s.name as string }))}
        staff={staff.map((u) => ({ value: u.id, label: u.name || u.email }))}
        payments={payTerms.map((p) => ({ value: p, label: t(`or2_${p}`) }))}
        channels={channelList.map((c) => ({ value: c.id as string, label: c.name as string }))}
        sellers={sellerList.map((p) => ({ value: p.id as string, label: p.name as string }))}
        srcChannels={srcList.map((c) => ({ value: c.id as string, label: c.name as string }))}
        saleTypes={[
          { value: 'retail', label: t('or2_retail') },
          { value: 'wholesale', label: t('or2_wholesale') },
        ]}
        payStates={[
          { value: 'unpaid', label: t('pay_unpaid') },
          { value: 'partial', label: t('pay_partial') },
          { value: 'paid', label: t('pay_paid') },
        ]}
        labels={{
          status: t('or2_status'), anyStatus: t('or2_all_status'),
          shop: t('or2_shop'), anyShop: t('or2_any_shop'),
          staff: t('or2_by'), anyStaff: t('or2_any_staff'),
          payment: t('or2_payment'), anyPayment: t('or2_any_payment'),
          channel: t('or2_channel'), anyChannel: t('or2_any_channel'),
          seller: t('or2_seller'), anySeller: t('or2_any_seller'),
          srcChannel: t('or2_src_channel'), anySrc: t('or2_any_src'),
          payState: t('or2_pay_state'), anyPayState: t('or2_any_pay_state'),
          saleType: t('or2_sale_type'), anySaleType: t('or2_any_sale_type'),
          search: t('or2_search_ph'), clear: t('or2_clear'),
        }}
      />

      <div className="text-sm text-muted">
        {t('or2_summary', { n: sums.count, v: sums.revenue.toLocaleString() })}
        {sums.outstanding > 0 && (
          <span className="ml-2 text-bad">
            · {t('pay_due')} {sums.outstanding.toLocaleString()} MMK
          </span>
        )}
        {!sp.q && <span className="ml-2 text-xs">{r.since} → {r.until}</span>}
      </div>

      {/* Phones get one block per order; the nine-column table starts at md. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((o) => {
          const shop = (o.msgr_shops as { name?: string } | null)?.name;
          const advance = Number(o.advance_payment ?? 0);
          const received = Number(o.amount_received ?? 0);
          const pstate = paymentState(Number(o.grand_total ?? 0), received);
          const ptone = pstate === 'paid' ? 'border-good text-good'
            : pstate === 'partial' ? 'border-brand text-brand' : 'border-bad text-bad';
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
                  <span>{t(`or2_${o.payment_method}`)}</span>
                  <span className={`rounded border px-1.5 py-0.5 ${ptone}`}>
                    {pstate === 'paid' ? t('pay_paid')
                      : pstate === 'partial' ? t('pay_partial') : t('pay_unpaid')}
                  </span>
                  <span className="ml-auto">
                    {new Date(`${o.order_date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM')}
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  {[(o.sales_person_name as string), (o.order_channel_name as string),
                    o.sale_type === 'wholesale' ? t('or2_wholesale') : null]
                    .filter(Boolean).join(' · ') || '—'}
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
              <th className="p-3 text-left font-normal">{t('or2_pay_state')}</th>
              <th className="p-3 text-left font-normal">{t('or2_seller')}</th>
              <th className="p-3 text-left font-normal">{t('or2_src_channel')}</th>
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
              const received = Number(o.amount_received ?? 0);
              const pstate = paymentState(Number(o.grand_total ?? 0), received);
              const due = balanceDue(Number(o.grand_total ?? 0), received);
              const ptone = pstate === 'paid' ? 'border-good text-good'
                : pstate === 'partial' ? 'border-brand text-brand' : 'border-bad text-bad';
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
                  <td className="p-3">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${ptone}`}>
                      {pstate === 'paid' ? t('pay_paid')
                        : pstate === 'partial' ? t('pay_partial') : t('pay_unpaid')}
                    </span>
                    {due > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted tabular-nums">
                        {due.toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {(o.sales_person_name as string) || '—'}
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {(o.order_channel_name as string) || '—'}
                    {o.sale_type === 'wholesale' && (
                      <div className="mt-0.5 text-[11px] text-brand">{t('or2_wholesale')}</div>
                    )}
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
              <tr><td colSpan={11} className="p-8 text-center text-muted">{t('or2_none')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <Pager page={page} pages={pages} total={listed.total}
          labels={{ prev: t('pg_prev'), next: t('pg_next'), of: t('pg_of') }} />
      )}
    </div>
  );
}
