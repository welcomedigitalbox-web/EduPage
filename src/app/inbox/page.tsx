import Link from 'next/link';
import { conversationList } from '@/lib/queries';
import { StageBadge, HandlerBadge, ago } from '@/components/ui';
import { ctx } from '@/lib/server-ctx';
import { STAGE_KEY } from '@/lib/i18n';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'unanswered', label: 'ib_unanswered' },
  { key: 'needs_human', label: 'ib_needs_human' },
  { key: 'bot', label: 'ib_bot' },
  { key: 'human', label: 'ib_human' },
  { key: 'no_reply', label: 'ib_no_reply' },
  { key: 'all', label: 'ib_all' },
];

export default async function Inbox({
  searchParams,
}: { searchParams: Promise<{ filter?: string }> }) {
  const { t } = await ctx();
  const sp = await searchParams;
  const filter = sp.filter ?? 'needs_human';
  const rows = await conversationList(filter);
  const handler = { bot: t('ib_by_bot'), human: t('ib_by_human'), none: t('ib_by_none') };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('ib_title')}</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link key={tab.key} href={`/inbox?filter=${tab.key}`}
            className={`btn ${tab.key === filter ? 'border-brand text-brand' : ''}`}>
            {t(tab.label)}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('ib_customer')}</th>
              <th className="p-3 text-left font-normal">{t('ib_stage')}</th>
              <th className="p-3 text-left font-normal">{t('ib_last_by')}</th>
              <th className="p-3 text-left font-normal">{t('ib_reason')}</th>
              <th className="p-3 text-right font-normal">{t('ib_msgs')}</th>
              <th className="p-3 text-right font-normal">{t('ib_last')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.msgr_contacts as unknown as {
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
                  <td className="p-3">{c && <StageBadge stage={c.stage} label={t(STAGE_KEY[c.stage] ?? c.stage)} />}</td>
                  <td className="p-3"><HandlerBadge by={r.last_reply_by} labels={handler} /></td>
                  <td className="p-3 max-w-[22rem] truncate text-xs text-muted">
                    {r.needs_human_reason ?? '—'}
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs">
                    {r.inbound_count}↓ {r.outbound_count}↑
                  </td>
                  <td className="p-3 text-right text-xs text-muted">{ago(r.last_message_at, t)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={6} className="p-8 text-center text-muted">{t('ib_empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
