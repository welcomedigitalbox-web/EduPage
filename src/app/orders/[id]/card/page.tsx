import Link from 'next/link';
import { notFound } from 'next/navigation';
import { orderDetail } from '@/lib/orders';
import { ctx } from '@/lib/server-ctx';
import { OrderCardBody, type CardRow } from '@/components/OrderCard';
import { CopyOrder } from '@/components/CopyOrder';
import { SaveImage } from '@/components/SaveImage';

export const dynamic = 'force-dynamic';

/** The internal card on a page of its own — a modal at 380px could not hold a
 *  Myanmar delivery address without wrapping through its own labels. */
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, lang } = await ctx();
  const { id } = await params;
  const data = await orderDetail(id);
  if (!data) notFound();
  const { order, items } = data;

  const ref = `EBH-${String(order.order_no).padStart(5, '0')}`;
  const fmt = (n: unknown) => Number(n ?? 0).toLocaleString();
  const dateStr = new Date(`${order.order_date}T00:00:00`)
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM');
  const shop = order.msgr_shops as { name?: string } | null;
  const channel = (order.msgr_payment_channels as { name?: string } | null)?.name;
  const advance = Number(order.advance_payment ?? 0);
  const balance = Number(order.grand_total ?? 0) - advance;

  const sections = [
    {
      title: t('or2_card_items'),
      rows: items.map((i) => [
        `${fmt(i.qty)} × ${i.description as string}`,
        `${fmt(i.line_total)}`,
        (i.barcode as string) || undefined,
      ] as CardRow),
    },
    {
      title: t('or2_card_customer'),
      rows: ([
        [t('or2_name'), order.customer_name as string],
        [t('or2_phone'), (order.phone as string) ?? '—'],
        order.city ? [t('or2_city'), order.city as string] : null,
        order.delivery_address ? [t('or2_address'), order.delivery_address as string] : null,
      ].filter(Boolean)) as CardRow[],
    },
    {
      title: t('or2_card_payment'),
      rows: ([
        [t('or2_payment'), `${t(`or2_${order.payment_method}`)}${channel ? ` · ${channel}` : ''}`],
        Number(order.discount) > 0 ? [t('or2_discount'), `−${fmt(order.discount)}`] : null,
        Number(order.delivery_fee) > 0 ? [t('or2_delivery_fee'), fmt(order.delivery_fee)] : null,
        advance > 0 ? [t('or2_advance'), `${fmt(advance)} MMK`] : null,
        advance > 0 ? [t('or2_final_payment'), `${fmt(balance)} MMK`] : null,
        [t('or2_delivery_method'), (order.delivery_method as string) ?? '—'],
      ].filter(Boolean)) as CardRow[],
    },
    {
      title: t('or2_card_meta'),
      rows: ([
        [t('or2_shop'), shop?.name ?? '—'],
        [t('or2_seller'), (order.sales_person_name as string) ?? '—'],
        [t('or2_created_by'), (order.created_by_name as string) ?? '—'],
        order.note ? [t('or2_note'), order.note as string] : null,
      ].filter(Boolean)) as CardRow[],
    },
  ];

  const shareText = [
    `${ref} · ${t(`os_${order.status}`)} · ${dateStr}`,
    ...sections.flatMap((sec) => ['', `【${sec.title}】`,
      ...sec.rows.map(([k, v]) => `${k}: ${v}`)]),
    '',
    `${t('or2_grand_total')}: ${fmt(order.grand_total)} MMK`,
  ].join('\n');

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/orders/${id}`} className="text-xs text-muted hover:text-brand print:hidden">
        ← {ref}
      </Link>

      <OrderCardBody
        ref_={ref}
        status={t(`os_${order.status}`)}
        date={dateStr}
        total={`${fmt(order.grand_total)} MMK`}
        sections={sections}
      />

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <SaveImage targetId="order-card" filename={ref}
          labels={{ save: t('or2_save_jpg'), saving: t('or2_saving_jpg'),
                    failed: t('or2_jpg_failed') }} />
        <CopyOrder text={shareText}
          labels={{ copy: t('or2_copy'), copied: t('or2_copied'), print: t('or2_print') }} />
      </div>
      <p className="text-center text-[11px] text-muted print:hidden">{t('or2_card_hint')}</p>
    </div>
  );
}
