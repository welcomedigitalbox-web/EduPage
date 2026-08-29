import Link from 'next/link';
import { conversationList } from '@/lib/queries';
import { StageBadge, HandlerBadge, ago } from '@/components/ui';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'needs_human', label: 'လူ လိုက်စစ်ရမယ်' },
  { key: 'bot', label: 'Bot ပြန်ဖြေထား' },
  { key: 'human', label: 'လူ ကိုင်နေ' },
  { key: 'no_reply', label: 'ဘယ်သူမှ မပြန်ရသေး' },
  { key: 'all', label: 'အားလုံး' },
];

export default async function Inbox({
  searchParams,
}: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter = sp.filter ?? 'needs_human';
  const rows = await conversationList(filter);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/inbox?filter=${t.key}`}
            className={`btn ${t.key === filter ? 'border-brand text-brand' : ''}`}>{t.label}</Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">ဖောက်သည်</th>
              <th className="p-3 text-left font-normal">Stage</th>
              <th className="p-3 text-left font-normal">နောက်ဆုံးပြန်ဖြေသူ</th>
              <th className="p-3 text-left font-normal">အကြောင်းအရင်း</th>
              <th className="p-3 text-right font-normal">စာ</th>
              <th className="p-3 text-right font-normal">နောက်ဆုံး</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.contacts as unknown as {
                id: string; name: string | null; psid: string; stage: LeadStage;
                phone: string | null; source_ad_id: string | null;
              };
              return (
                <tr key={r.id} className="border-b border-edge/60 hover:bg-edge/30">
                  <td className="p-3">
                    <Link href={`/inbox/${r.id}`} className="hover:text-brand">
                      {c?.name ?? `PSID ${c?.psid?.slice(-6)}`}
                    </Link>
                    <div className="text-xs text-muted">
                      {c?.phone ?? '—'}{c?.source_ad_id ? ' · ad' : ' · organic'}
                    </div>
                  </td>
                  <td className="p-3">{c && <StageBadge stage={c.stage} />}</td>
                  <td className="p-3"><HandlerBadge by={r.last_reply_by} /></td>
                  <td className="p-3 max-w-[22rem] truncate text-xs text-muted">
                    {r.needs_human_reason ?? '—'}
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs">
                    {r.inbound_count}↓ {r.outbound_count}↑
                  </td>
                  <td className="p-3 text-right text-xs text-muted">{ago(r.last_message_at)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={6} className="p-8 text-center text-muted">ဒီစာရင်းမှာ ဘာမှမရှိပါ</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
