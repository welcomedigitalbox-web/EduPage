'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const SEL =
  'rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none focus:border-brand';

export interface FilterOption { value: string; label: string }

export interface OrderFilterLabels {
  shop: string; anyShop: string;
  staff: string; anyStaff: string;
  payment: string; anyPayment: string;
  channel: string; anyChannel: string;
  search: string; clear: string;
}

/** The dropdowns write straight into the URL, so a filtered view can be
 *  bookmarked and sent to someone else — and the range picker's own params
 *  survive because every control copies the query rather than replacing it. */
export function OrderFilters({
  shops, staff, payments, channels, labels,
}: {
  shops: FilterOption[];
  staff: FilterOption[];
  payments: FilterOption[];
  channels: FilterOption[];
  labels: OrderFilterLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function go(key: string, value: string) {
    const q = new URLSearchParams(sp.toString());
    value ? q.set(key, value) : q.delete(key);
    router.push(`${pathname}?${q.toString()}`);
  }

  const dirty = ['shop', 'by', 'pay', 'channel', 'q'].some((k) => sp.get(k));

  const Picker = ({ name, any, options }: { name: string; any: string; options: FilterOption[] }) => (
    <select className={SEL} value={sp.get(name) ?? ''} onChange={(e) => go(name, e.target.value)}>
      <option value="">{any}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Picker name="shop" any={labels.anyShop} options={shops} />
      <Picker name="by" any={labels.anyStaff} options={staff} />
      <Picker name="pay" any={labels.anyPayment} options={payments} />
      {channels.length > 0 && <Picker name="channel" any={labels.anyChannel} options={channels} />}
      <input
        className={`${SEL} w-40`} placeholder={labels.search}
        defaultValue={sp.get('q') ?? ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go('q', (e.target as HTMLInputElement).value.trim());
        }} />
      {dirty && (
        <button className="btn text-xs" onClick={() => {
          const q = new URLSearchParams(sp.toString());
          ['shop', 'by', 'pay', 'channel', 'q'].forEach((k) => q.delete(k));
          router.push(`${pathname}?${q.toString()}`);
        }}>{labels.clear}</button>
      )}
    </div>
  );
}
