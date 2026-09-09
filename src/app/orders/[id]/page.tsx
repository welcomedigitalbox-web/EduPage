import Link from 'next/link';
import { notFound } from 'next/navigation';
import { orderDetail, shops, paymentChannels } from '@/lib/orders';
import { ctx } from '@/lib/server-ctx';
import { OrderForm } from '@/components/OrderForm';
import { orderFormLabels } from '@/lib/order-labels';

export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { t, lang } = await ctx();
  const { id } = await params;
  const { edit } = await searchParams;
  const data = await orderDetail(id);
  if (!data) notFound();
  const { order, items } = data;
  const [list, channels] = await Promise.all([shops(), paymentChannels()]);

  const ref = `EBH-${String(order.order_no).padStart(5, '0')}`;
  const fmt = (n: unknown) => Number(n ?? 0).toLocaleString();

  if (edit) {
    return (
      <div className="space-y-4">
        <div>
          <Link href={`/orders/${id}`} className="text-xs text-muted hover:text-brand">{t('or2_back')}</Link>
          <h1 className="mt-1 text-xl font-semibold">{ref}</h1>
        </div>
        <OrderForm
          shops={list as { id: string; name: string; region: string | null }[]}
          channels={channels as { id: string; name: string; kind: string }[]}
          orderId={id}
          contactId={order.contact_id as string | null}
          conversationId={order.conversation_id as string | null}
          initial={{
            customer_name: order.customer_name as string,
            phone: (order.phone as string) ?? '',
            city: (order.city as string) ?? '',
            delivery_address: (order.delivery_address as string) ?? '',
            shop_id: (order.shop_id as string) ?? '',
            order_date: order.order_date as string,
            delivery_method: (order.delivery_method as string) ?? '',
            payment_method: order.payment_method as string,
            payment_channel_id: (order.payment_channel_id as string) ?? '',
            payment_ref: (order.payment_ref as string) ?? '',
            advance_payment: Number(order.advance_payment),
            delivery_fee: Number(order.delivery_fee),
            discount: Number(order.discount),
            status: order.status as string,
            note: (order.note as string) ?? '',
            items: items.map((i) => ({
              barcode: (i.barcode as string) ?? '',
              description: i.description as string,
              unit_price: Number(i.unit_price),
              qty: Number(i.qty),
            })),
          }}
          labels={orderFormLabels(t)}
        />
      </div>
    );
  }

  const shop = (order.msgr_shops as { name?: string; region?: string } | null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/orders" className="text-xs text-muted hover:text-brand">{t('or2_back')}</Link>
          <h1 className="mt-1 text-xl font-semibold">{ref}</h1>
          <p className="text-sm text-muted">
            {t(`os_${order.status}`)} ·{' '}
            {new Date(`${order.order_date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM')}
          </p>
        </div>
        <div className="flex gap-2">
          {order.conversation_id ? (
            <Link className="btn" href={`/inbox/${order.conversation_id}`}>{t('or2_open_chat')}</Link>
          ) : null}
          <Link className="btn-primary" href={`/orders/${id}?edit=1`}>{t('or2_edit')}</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          <div className="label p-3">{t('or2_items')}</div>
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-muted">
              <tr className="border-b border-edge">
                <th className="p-3 text-left font-normal">{t('or2_barcode')}</th>
                <th className="p-3 text-left font-normal">{t('or2_desc')}</th>
                <th className="p-3 text-right font-normal">{t('or2_unit_price')}</th>
                <th className="p-3 text-right font-normal">{t('or2_qty')}</th>
                <th className="p-3 text-right font-normal">{t('or2_line_total')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {items.map((i) => (
                <tr key={i.id as string} className="border-b border-edge/50 last:border-0">
                  <td className="p-3 text-xs text-muted">{(i.barcode as string) ?? '—'}</td>
                  <td className="p-3">{i.description as string}</td>
                  <td className="p-3 text-right">{fmt(i.unit_price)}</td>
                  <td className="p-3 text-right">{fmt(i.qty)}</td>
                  <td className="p-3 text-right">{fmt(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-edge">
                <td colSpan={4} className="p-3 text-right text-muted">{t('or2_subtotal')}</td>
                <td className="p-3 text-right tabular-nums">{fmt(order.subtotal)}</td>
              </tr>
              {Number(order.discount) > 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-right text-muted">{t('or2_discount')}</td>
                  <td className="p-3 text-right tabular-nums text-warn">−{fmt(order.discount)}</td>
                </tr>
              )}
              {Number(order.delivery_fee) > 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-right text-muted">{t('or2_delivery_fee')}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(order.delivery_fee)}</td>
                </tr>
              )}
              <tr className="border-t border-edge">
                <td colSpan={4} className="p-3 text-right font-medium">{t('or2_grand_total')}</td>
                <td className="p-3 text-right text-lg font-semibold tabular-nums">
                  {fmt(order.grand_total)} MMK
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <aside className="space-y-4">
          <div className="card space-y-2 p-3 text-sm">
            <div className="label">{t('or2_customer')}</div>
            <Row k={t('or2_name')} v={order.customer_name as string} />
            <Row k={t('or2_phone')} v={(order.phone as string) ?? '—'} />
            <Row k={t('or2_city')} v={(order.city as string) ?? '—'} />
            <Row k={t('or2_shop')} v={shop?.name ?? '—'} />
            <Row k={t('or2_source')}
                 v={order.source_ad_id ? `ad · ${String(order.source_ad_id).slice(-8)}` : (order.source_type as string) ?? 'organic'} />
          </div>

          {order.delivery_address ? (
            <div className="card p-3 text-sm">
              <div className="label mb-1">{t('or2_address')}</div>
              <p className="whitespace-pre-wrap">{order.delivery_address as string}</p>
            </div>
          ) : null}

          <div className="card space-y-2 p-3 text-sm">
            <div className="label">{t('or2_payment')}</div>
            <Row k={t('or2_payment')} v={t(`or2_${order.payment_method}`)} />
            <Row k={t('or2_advance')} v={`${fmt(order.advance_payment)} MMK`} />
            {Number(order.advance_payment) > 0 && (
              <>
                <Row k={t('or2_channel')}
                  v={(order.msgr_payment_channels as { name?: string } | null)?.name ?? '—'} />
                {order.payment_ref ? (
                  <Row k={t('or2_pay_ref')} v={order.payment_ref as string} />
                ) : null}
                <Row k={t('or2_cod_due')}
                  v={`${fmt(Number(order.grand_total) - Number(order.advance_payment))} MMK`} />
              </>
            )}
            <Row k={t('or2_delivery_method')} v={(order.delivery_method as string) ?? '—'} />
            <Row k={t('or2_created_by')} v={(order.created_by_name as string) ?? '—'} />
          </div>

          {order.note ? (
            <div className="card p-3 text-sm">
              <div className="label mb-1">{t('or2_note')}</div>
              <p className="whitespace-pre-wrap">{order.note as string}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted">{k}</span>
      <span className="text-right text-xs">{v}</span>
    </div>
  );
}
