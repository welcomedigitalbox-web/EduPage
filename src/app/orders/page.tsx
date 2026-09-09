import Link from 'next/link';
import { orderList } from '@/lib/orders';
import { ctx } from '@/lib/server-ctx';
import { money, num } from '@/components/ui';

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
}: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { t, lang } = await ctx();
  const sp = await searchParams;
  const rows = await orderList({ status: sp.status, q: sp.q });

  const statuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('or2_title')}</h1>
          <p className="text-sm text-muted">{t('or2_sub')}</p>
        </div>
        <Link className="btn-primary" href="/orders/new">{t('or2_new')}</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/orders" className={`btn text-xs ${!sp.status ? 'border-brand text-brand' : ''}`}>
          {t('or2_all_status')}
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/orders?status=${s}`}
            className={`btn text-xs ${sp.status === s ? 'border-brand text-brand' : ''}`}>
            {t(`os_${s}`)}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('or2_ref')}</th>
              <th className="p-3 text-left font-normal">{t('or2_customer')}</th>
              <th className="p-3 text-left font-normal">{t('or2_shop')}</th>
              <th className="p-3 text-left font-normal">{t('or2_source')}</th>
              <th className="p-3 text-left font-normal">{t('or2_status')}</th>
              <th className="p-3 text-left font-normal">{t('or2_date')}</th>
              <th className="p-3 text-right font-normal">{t('or2_total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const shop = (o.msgr_shops as { name?: string } | null)?.name;
              const items = (o.msgr_order_items as unknown[] | null)?.length ?? 0;
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
              <tr><td colSpan={7} className="p-8 text-center text-muted">{t('or2_none')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
