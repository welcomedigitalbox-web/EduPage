import Link from 'next/link';
import { notFound } from 'next/navigation';
import { orderDetail, shops, paymentChannels } from '@/lib/orders';
import { ctx } from '@/lib/server-ctx';
import { OrderForm } from '@/components/OrderForm';
import { orderFormLabels } from '@/lib/order-labels';
import { CopyOrder } from '@/components/CopyOrder';
import { OrderWorkflow } from '@/components/OrderWorkflow';
import { OrderCard } from '@/components/OrderCard';
import { canEdit } from '@/lib/order-workflow';
import { admin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { t, lang, session } = await ctx();
  const { id } = await params;
  const { edit } = await searchParams;
  const data = await orderDetail(id);
  if (!data) notFound();
  const { order, items } = data;
  const [list, channels] = await Promise.all([shops(), paymentChannels()]);

  const ref = `EBH-${String(order.order_no).padStart(5, '0')}`;
  const fmt = (n: unknown) => Number(n ?? 0).toLocaleString();

  if (edit && !canEdit(session?.role ?? 'agent', { payment_status: order.payment_status as string })) {
    return (
      <div className="card p-6 text-center text-sm text-muted">
        {t('or2_no_permission')}
        <div className="mt-3">
          <Link className="btn" href={`/orders/${id}`}>{t('or2_back')}</Link>
        </div>
      </div>
    );
  }

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
            payment_slip_url: (order.payment_slip_url as string) ?? '',
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

  const role = session?.role ?? 'agent';
  const paymentStatus = (order.payment_status as string) ?? 'pending';
  const deliveryStatus = (order.delivery_status as string) ?? 'pending';
  const { data: history } = await admin()
    .from('msgr_order_events')
    .select('id,track,from_state,to_state,actor_name,created_at')
    .eq('order_id', id).order('created_at', { ascending: false }).limit(20);

  const shop = (order.msgr_shops as { name?: string; region?: string } | null);
  const channel = (order.msgr_payment_channels as { name?: string } | null)?.name;
  const advance = Number(order.advance_payment ?? 0);
  const balance = Number(order.grand_total ?? 0) - advance;
  const dateStr = new Date(`${order.order_date}T00:00:00`)
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM');

  // The same four cards, flattened for Viber. Anything that is empty on screen
  // is left out here too, so the message stays short enough to read on a phone.
  const shareText = [
    `${ref} · ${t(`os_${order.status}`)}`,
    '',
    `【${t('or2_card_items')}】`,
    ...items.map((i) =>
      `• ${i.description as string}${i.barcode ? ` (${i.barcode})` : ''}` +
      ` — ${fmt(i.qty)} × ${fmt(i.unit_price)} = ${fmt(i.line_total)}`),
    '',
    `【${t('or2_card_customer')}】`,
    `${t('or2_name')}: ${order.customer_name as string}`,
    `${t('or2_phone')}: ${(order.phone as string) ?? '—'}`,
    order.city ? `${t('or2_city')}: ${order.city as string}` : null,
    order.delivery_address ? `${t('or2_address')}: ${order.delivery_address as string}` : null,
    '',
    `【${t('or2_card_payment')}】`,
    `${t('or2_payment')}: ${t(`or2_${order.payment_method}`)}${channel ? ` (${channel})` : ''}`,
    `${t('or2_subtotal')}: ${fmt(order.subtotal)}`,
    Number(order.discount) > 0 ? `${t('or2_discount')}: -${fmt(order.discount)}` : null,
    Number(order.delivery_fee) > 0 ? `${t('or2_delivery_fee')}: ${fmt(order.delivery_fee)}` : null,
    `${t('or2_grand_total')}: ${fmt(order.grand_total)} MMK`,
    advance > 0 ? `${t('or2_advance')}: ${fmt(advance)} MMK` : null,
    advance > 0 ? `${t('or2_final_payment')}: ${fmt(balance)} MMK` : null,
    `${t('or2_delivery_method')}: ${(order.delivery_method as string) ?? '—'}`,
    '',
    `【${t('or2_card_meta')}】`,
    `${t('or2_shop')}: ${shop?.name ?? '—'}`,
    `${t('or2_order_date')}: ${dateStr}`,
    `${t('or2_created_by')}: ${(order.created_by_name as string) ?? '—'}`,
    order.note ? `${t('or2_note')}: ${order.note as string}` : null,
  ].filter((l) => l !== null).join('\n');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/orders" className="text-xs text-muted hover:text-brand print:hidden">
            {t('or2_back')}
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{ref}</h1>
          <p className="text-sm text-muted">{t(`os_${order.status}`)} · {dateStr}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderCard
            ref_={ref}
            status={t(`os_${order.status}`)}
            date={dateStr}
            total={`${fmt(order.grand_total)} MMK`}
            shareText={shareText}
            sections={[
              {
                title: t('or2_card_items'),
                rows: items.map((i) => [
                  `${i.description as string}${Number(i.qty) > 1 ? ` ×${fmt(i.qty)}` : ''}`,
                  `${fmt(i.line_total)}`,
                ] as [string, string]),
              },
              {
                title: t('or2_card_customer'),
                rows: ([
                  [t('or2_name'), order.customer_name as string],
                  [t('or2_phone'), (order.phone as string) ?? '—'],
                  order.delivery_address
                    ? [t('or2_address'), order.delivery_address as string] : null,
                ].filter(Boolean)) as [string, string][],
              },
              {
                title: t('or2_card_payment'),
                rows: ([
                  [t('or2_payment'), `${t(`or2_${order.payment_method}`)}${channel ? ` · ${channel}` : ''}`],
                  Number(order.discount) > 0
                    ? [t('or2_discount'), `−${fmt(order.discount)}`] : null,
                  Number(order.delivery_fee) > 0
                    ? [t('or2_delivery_fee'), fmt(order.delivery_fee)] : null,
                  advance > 0 ? [t('or2_advance'), `${fmt(advance)} MMK`] : null,
                  advance > 0 ? [t('or2_final_payment'), `${fmt(balance)} MMK`] : null,
                  [t('or2_delivery_method'), (order.delivery_method as string) ?? '—'],
                ].filter(Boolean)) as [string, string][],
              },
              {
                title: t('or2_card_meta'),
                rows: [
                  [t('or2_shop'), shop?.name ?? '—'],
                  [t('or2_created_by'), (order.created_by_name as string) ?? '—'],
                ] as [string, string][],
              },
            ]}
            labels={{
              open: t('or2_card_open'), close: t('or2_card_close'),
              copy: t('or2_copy'), copied: t('or2_copied'), print: t('or2_print'),
              hint: t('or2_card_hint'),
            }}
          />
          <CopyOrder text={shareText}
            labels={{ copy: t('or2_copy'), copied: t('or2_copied'), print: t('or2_print') }} />
          {order.conversation_id ? (
            <Link className="btn print:hidden" href={`/inbox/${order.conversation_id}`}>
              {t('or2_open_chat')}
            </Link>
          ) : null}
          {canEdit(role, { payment_status: paymentStatus }) && (
            <Link className="btn-primary print:hidden" href={`/orders/${id}?edit=1`}>
              {t('or2_edit')}
            </Link>
          )}
        </div>
      </div>

      <OrderWorkflow
        orderId={id}
        role={role}
        payment={paymentStatus}
        delivery={deliveryStatus}
        status={order.status as string}
        labels={{
          payment: t('or2_pay_track'), delivery: t('or2_del_track'),
          states: {
            pending: t('or2_tr_pending'), processing: t('or2_tr_processing'),
            done: t('or2_tr_done'),
          },
          forwardOnly: t('or2_forward_only'), del: t('or2_delete'),
          delConfirm: t('or2_delete_confirm'), delLocked: t('or2_delete_locked'),
          cancel: t('or2_cancel_order'), notAllowed: t('or2_no_permission'),
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1 — items */}
        <div className="card lg:col-span-2">
          <div className="label p-3">{t('or2_card_items')}</div>

          {/* A five-column table does not fit a phone, so on small screens each
              line becomes its own block instead of a sideways scroll. */}
          <ul className="divide-y divide-edge/60 sm:hidden">
            {items.map((i) => (
              <li key={i.id as string} className="space-y-1 p-3 text-sm">
                <div className="font-medium">{i.description as string}</div>
                {i.barcode ? (
                  <div className="text-[11px] text-muted">{i.barcode as string}</div>
                ) : null}
                <div className="flex items-baseline justify-between tabular-nums">
                  <span className="text-xs text-muted">
                    {fmt(i.qty)} × {fmt(i.unit_price)}
                  </span>
                  <span>{fmt(i.line_total)}</span>
                </div>
              </li>
            ))}
            <li className="flex items-baseline justify-between p-3 text-sm">
              <span className="text-muted">{t('or2_subtotal')}</span>
              <span className="tabular-nums">{fmt(order.subtotal)}</span>
            </li>
          </ul>

          <div className="hidden overflow-x-auto sm:block">
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
            </tfoot>
          </table>
          </div>
        </div>

        {/* 2 — customer */}
        <div className="card space-y-2 p-4 text-sm">
          <div className="label">{t('or2_card_customer')}</div>
          <Row k={t('or2_name')} v={order.customer_name as string} />
          <Row k={t('or2_phone')} v={(order.phone as string) ?? '—'} />
          <Row k={t('or2_city')} v={(order.city as string) ?? '—'} />
          <div className="border-t border-edge pt-2">
            <div className="text-xs text-muted">{t('or2_address')}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {(order.delivery_address as string) || '—'}
            </p>
          </div>
        </div>

        {/* 3 — payment */}
        <div className="card space-y-2 p-4 text-sm">
          <div className="label">{t('or2_card_payment')}</div>
          <Row k={t('or2_payment')} v={t(`or2_${order.payment_method}`)} />
          {channel ? <Row k={t('or2_channel')} v={channel} /> : null}
          {order.payment_ref ? <Row k={t('or2_pay_ref')} v={order.payment_ref as string} /> : null}
          {order.payment_slip_url ? (
            <a href={order.payment_slip_url as string} target="_blank" rel="noreferrer"
               className="block overflow-hidden rounded-lg border border-edge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.payment_slip_url as string} alt={t('or2_slip')}
                   className="max-h-56 w-full object-contain bg-ink" />
            </a>
          ) : null}
          <Row k={t('or2_subtotal')} v={`${fmt(order.subtotal)} MMK`} />
          {Number(order.discount) > 0 && (
            <Row k={t('or2_discount')} v={`−${fmt(order.discount)} MMK`} />
          )}
          {Number(order.delivery_fee) > 0 && (
            <Row k={t('or2_delivery_fee')} v={`${fmt(order.delivery_fee)} MMK`} />
          )}
          <div className="flex items-baseline justify-between border-t border-edge pt-2">
            <span className="text-sm">{t('or2_grand_total')}</span>
            <span className="text-lg font-semibold tabular-nums">
              {fmt(order.grand_total)} MMK
            </span>
          </div>
          {advance > 0 && (
            <>
              <Row k={t('or2_advance')} v={`${fmt(advance)} MMK`} />
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">{t('or2_final_payment')}</span>
                <span className="text-sm font-medium tabular-nums text-good">
                  {fmt(balance)} MMK
                </span>
              </div>
            </>
          )}
          <Row k={t('or2_delivery_method')} v={(order.delivery_method as string) ?? '—'} />
        </div>

        {/* 4 — who, when, where from */}
        <div className="card space-y-2 p-4 text-sm lg:col-span-2">
          <div className="label">{t('or2_card_meta')}</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Row k={t('or2_order_id')} v={ref} />
            <Row k={t('or2_created_by')} v={(order.created_by_name as string) ?? '—'} />
            <Row k={t('or2_order_date')} v={dateStr} />
            <Row k={t('or2_shop')} v={shop?.name ?? '—'} />
            <Row k={t('or2_source')}
              v={order.source_ad_id
                ? `ad · ${String(order.source_ad_id).slice(-8)}`
                : (order.source_type as string) ?? 'organic'} />
          </div>
          {order.note ? (
            <div className="border-t border-edge pt-2">
              <div className="text-xs text-muted">{t('or2_note')}</div>
              <p className="mt-1 whitespace-pre-wrap">{order.note as string}</p>
            </div>
          ) : null}

          {(history ?? []).length > 0 && (
            <div className="border-t border-edge pt-2 print:hidden">
              <div className="text-xs text-muted">{t('or2_history')}</div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
                {(history ?? []).map((h) => (
                  <li key={h.id as string}>
                    {h.track === 'payment' ? t('or2_pay_track')
                      : h.track === 'delivery' ? t('or2_del_track') : t('or2_status')}
                    : {h.from_state ? `${t(`or2_tr_${h.from_state}`)} → ` : ''}
                    <span className="text-white">
                      {h.to_state === 'cancelled' ? t('os_cancelled') : t(`or2_tr_${h.to_state}`)}
                    </span>
                    {' · '}{(h.actor_name as string) ?? '—'}
                    {' · '}{new Date(h.created_at as string).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
