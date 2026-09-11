import Link from 'next/link';
import { notFound } from 'next/navigation';
import { orderDetail } from '@/lib/orders';
import { getSettings } from '@/lib/crm';
import { ctx } from '@/lib/server-ctx';
import { ReceiptBody } from '@/components/Receipt';
import { CopyOrder } from '@/components/CopyOrder';
import { SaveImage } from '@/components/SaveImage';

export const dynamic = 'force-dynamic';

/** The customer-facing receipt, on its own page so it can be saved as a JPG
 *  and sent straight into the Messenger thread. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, lang } = await ctx();
  const { id } = await params;
  const [data, settings] = await Promise.all([orderDetail(id), getSettings()]);
  if (!data) notFound();
  const { order, items } = data;

  const ref = `EBH-${String(order.order_no).padStart(5, '0')}`;
  const fmt = (n: unknown) => Number(n ?? 0).toLocaleString();
  const dateStr = new Date(`${order.order_date}T00:00:00`)
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM');
  const advance = Number(order.advance_payment ?? 0);
  const balance = Number(order.grand_total ?? 0) - advance;

  const money: [string, string, boolean?][] = [
    [t('or2_subtotal'), `${fmt(order.subtotal)} MMK`],
    ...(Number(order.discount) > 0
      ? [[t('or2_discount'), `−${fmt(order.discount)} MMK`] as [string, string]] : []),
    ...(Number(order.delivery_fee) > 0
      ? [[t('or2_delivery_fee'), `${fmt(order.delivery_fee)} MMK`] as [string, string]] : []),
    [t('or2_grand_total'), `${fmt(order.grand_total)} MMK`, true],
    ...(advance > 0
      ? [[t('rc_paid'), `${fmt(advance)} MMK`] as [string, string],
         [t('rc_due'), `${fmt(balance)} MMK`] as [string, string]]
      : []),
  ];

  const shopName = settings.receipt_shop_name || settings.business_name;
  const text = [
    shopName, settings.receipt_phone || null, settings.receipt_note || null, '',
    `${ref} · ${dateStr}`,
    `${t('rc_to')}: ${order.customer_name as string}`,
    order.phone ? (order.phone as string) : null,
    order.delivery_address ? (order.delivery_address as string) : null,
    '',
    ...items.map((i) => `${fmt(i.qty)} × ${i.description as string} — ${fmt(i.line_total)}`),
    '',
    ...money.map(([k, v]) => `${k}: ${v}`),
    order.delivery_method ? `${t('or2_delivery_method')}: ${order.delivery_method as string}` : null,
    '', settings.receipt_footer || null,
  ].filter((l) => l !== null).join('\n');

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/orders/${id}`} className="text-xs text-muted hover:text-brand print:hidden">
        ← {ref}
      </Link>

      <ReceiptBody
        data={{
          shopName,
          phone: settings.receipt_phone,
          note: settings.receipt_note,
          footer: settings.receipt_footer,
          ref, date: dateStr,
          customer: order.customer_name as string,
          customerPhone: (order.phone as string) ?? null,
          address: (order.delivery_address as string) ?? null,
          lines: items.map((i) => ({
            qty: fmt(i.qty), name: i.description as string,
            price: fmt(i.unit_price), total: fmt(i.line_total),
          })),
          money,
          deliveryMethod: (order.delivery_method as string) ?? null,
          paymentMethod: t(`or2_${order.payment_method}`),
        }}
        labels={{
          to: t('rc_to'), item: t('rc_item'), amount: t('rc_amount'),
          delivery: t('or2_delivery_method'), payment: t('or2_payment'),
        }}
      />

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <SaveImage targetId="receipt" filename={`${ref}-receipt`}
          labels={{ save: t('or2_save_jpg'), saving: t('or2_saving_jpg'),
                    failed: t('or2_jpg_failed') }} />
        <CopyOrder text={text}
          labels={{ copy: t('or2_copy'), copied: t('or2_copied'), print: t('or2_print') }} />
      </div>
      <p className="text-center text-[11px] text-muted print:hidden">{t('rc_hint')}</p>
    </div>
  );
}
