import Link from 'next/link';
import { orderList, paymentChannels, shopName } from '@/lib/orders';
import { ctx } from '@/lib/server-ctx';
import { SettleList } from '@/components/SettleList';
import { balanceDue } from '@/lib/order-payment';

export const dynamic = 'force-dynamic';

/** Everything the shop is still owed, oldest first — the list a courier's
 *  statement is checked against. */
export default async function Settle() {
  const { t } = await ctx();
  const [listed, channels] = await Promise.all([
    orderList({ paid: 'unpaid,partial', perPage: 1000 }),
    paymentChannels(),
  ]);
  const rows = listed.rows;

  const owed = rows
    .filter((o) => o.status !== 'cancelled')
    .map((o) => ({
      id: o.id as string,
      order_no: Number(o.order_no),
      customer_name: o.customer_name as string,
      phone: (o.phone as string) ?? null,
      order_date: o.order_date as string,
      grand_total: Number(o.grand_total ?? 0),
      amount_received: Number(o.amount_received ?? 0),
      delivery_method: (o.delivery_method as string) ?? null,
      shop: shopName(o.stores),
      payment_method: o.payment_method as string,
    }))
    .sort((a, b) => a.order_date.localeCompare(b.order_date));

  const total = owed.reduce((a, o) => a + balanceDue(o.grand_total, o.amount_received), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/orders" className="text-xs text-muted hover:text-brand">
            {t('or2_back')}
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{t('st_title')}</h1>
          <p className="text-sm text-muted">{t('st_sub')}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">{t('pay_due')}</div>
          <div className="text-xl font-semibold tabular-nums text-bad">
            {total.toLocaleString()} MMK
          </div>
          <div className="text-[11px] text-muted">
            {t('or2_summary', { n: owed.length, v: '' }).replace('·  MMK', '').trim()}
          </div>
        </div>
      </div>

      <SettleList
        rows={owed}
        channels={channels as { id: string; name: string }[]}
        labels={{
          title: t('st_title'), sub: t('st_sub'),
          channel: t('or2_channel'), pickChannel: t('or2_pick_channel'),
          ref: t('st_ref'), refPh: t('st_ref_ph'), date: t('pay_date'),
          note: t('or2_note'), notePh: t('pay_note_ph'),
          settle: t('st_settle'), settling: t('pay_saving'),
          selected: t('st_selected'), none: t('st_none'),
          all: t('st_all'), clear: t('or2_clear'), search: t('st_search'),
          failed: t('or2_failed'), order: t('or2_ref'), customer: t('or2_customer'),
          delivery: t('or2_delivery_method'), due: t('pay_due'), amount: t('pay_amount'),
        }}
      />
    </div>
  );
}
