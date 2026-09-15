'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { MultiSelect, type Option } from './MultiSelect';

export type FilterOption = Option;

export interface OrderFilterLabels {
  status: string; anyStatus: string;
  shop: string; anyShop: string;
  staff: string; anyStaff: string;
  payment: string; anyPayment: string;
  channel: string; anyChannel: string;
  seller: string; anySeller: string;
  srcChannel: string; anySrc: string;
  payState: string; anyPayState: string;
  saleType: string; anySaleType: string;
  search: string; clear: string;
}

const KEYS = ['status', 'shop', 'by', 'pay', 'channel', 'seller', 'src', 'paid',
              'sale_type', 'q'];

/**
 * Every filter takes several values, and the status chips that used to sit
 * above this row are one of them — two controls for the same column only
 * invited them to contradict each other.
 */
export function OrderFilters({
  statuses, shops, staff, payments, channels, sellers, srcChannels, payStates,
  saleTypes, labels,
}: {
  statuses: FilterOption[];
  shops: FilterOption[];
  staff: FilterOption[];
  payments: FilterOption[];
  channels: FilterOption[];
  sellers: FilterOption[];
  srcChannels: FilterOption[];
  payStates: FilterOption[];
  saleTypes: FilterOption[];
  labels: OrderFilterLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const values = (key: string) => (sp.get(key) ?? '').split(',').filter(Boolean);

  function set(key: string, next: string[] | string) {
    const q = new URLSearchParams(sp.toString());
    const v = Array.isArray(next) ? next.join(',') : next;
    v ? q.set(key, v) : q.delete(key);
    router.push(`${pathname}?${q.toString()}`);
  }

  const dirty = KEYS.some((k) => sp.get(k));

  const pickers: [string, string, string, FilterOption[]][] = [
    ['status', labels.status, labels.anyStatus, statuses],
    ['paid', labels.payState, labels.anyPayState, payStates],
    ['sale_type', labels.saleType, labels.anySaleType, saleTypes],
    ['shop', labels.shop, labels.anyShop, shops],
    ['seller', labels.seller, labels.anySeller, sellers],
    ['src', labels.srcChannel, labels.anySrc, srcChannels],
    ['pay', labels.payment, labels.anyPayment, payments],
    ['channel', labels.channel, labels.anyChannel, channels],
    ['by', labels.staff, labels.anyStaff, staff],
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pickers.map(([key, label, all, options]) => (
        <MultiSelect key={key} label={label} allLabel={all} options={options}
          selected={values(key)} onChange={(next) => set(key, next)} />
      ))}

      <input
        className="w-40 rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none focus:border-brand"
        placeholder={labels.search}
        defaultValue={sp.get('q') ?? ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value.trim());
        }} />

      {dirty && (
        <button className="btn text-xs" onClick={() => {
          const q = new URLSearchParams(sp.toString());
          KEYS.forEach((k) => q.delete(k));
          router.push(`${pathname}?${q.toString()}`);
        }}>{labels.clear}</button>
      )}
    </div>
  );
}
