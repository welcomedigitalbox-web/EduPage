import Link from 'next/link';
import { customerList } from '@/lib/queries';
import { StageBadge, ago, money, num } from '@/components/ui';
import { ctx } from '@/lib/server-ctx';
import { STAGE_KEY } from '@/lib/i18n';
import { CustomerFilters, ProfileEditor } from '@/components/Customers';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Customers({
  searchParams,
}: { searchParams: Promise<{ q?: string; stage?: string; source?: string }> }) {
  const { t } = await ctx();
  const sp = await searchParams;
  const rows = await customerList({ q: sp.q, stage: sp.stage, source: sp.source });

  const exportUrl = `/api/customers/export?${new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][]
  )}`;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('cu_title')}</h1>
          <p className="text-sm text-muted">{t('cu_sub')}</p>
        </div>
        <a className="btn" href={exportUrl}>{t('cu_export')}</a>
      </div>

      <CustomerFilters
        initial={{ q: sp.q ?? '', stage: sp.stage ?? '', source: sp.source ?? '' }}
        labels={{
          search: t('cu_search'),
          allStages: t('cu_all_stages'),
          allSources: t('cu_all_sources'),
          fromAd: t('cu_from_ad'),
          organic: t('cu_organic'),
        }}
        stages={Object.entries(STAGE_KEY).map(([k, key]) => ({ value: k, label: t(key) }))}
      />

      <div className="text-xs text-muted">{t('cu_count', { n: rows.length })}</div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('cu_name')}</th>
              <th className="p-3 text-left font-normal">{t('cu_phone')}</th>
              <th className="p-3 text-left font-normal">Stage</th>
              <th className="p-3 text-left font-normal">{t('cu_source')}</th>
              <th className="p-3 text-left font-normal">{t('cu_tags')}</th>
              <th className="p-3 text-right font-normal">{t('cu_orders')}</th>
              <th className="p-3 text-right font-normal">{t('cu_revenue')}</th>
              <th className="p-3 text-right font-normal">{t('cu_last_msg')}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contact_id} className="border-b border-edge/60 align-top hover:bg-edge/30">
                <td className="p-3">
                  <div>{r.name ?? `PSID ${r.psid.slice(-6)}`}</div>
                  {r.customer_id && <div className="text-[11px] text-good">{t('cu_pos_linked')}</div>}
                  {r.notes && <div className="mt-1 max-w-[16rem] truncate text-[11px] text-muted">{r.notes}</div>}
                </td>
                <td className="p-3 text-xs">{r.phone ?? '—'}</td>
                <td className="p-3">
                  <StageBadge stage={r.stage as LeadStage} label={t(STAGE_KEY[r.stage] ?? r.stage)} />
                </td>
                <td className="p-3 text-xs text-muted">
                  {r.source_ad_id ? `ad · ${r.source_ad_id.slice(-6)}` : (r.source_type ?? 'organic')}
                </td>
                <td className="p-3">
                  <div className="flex max-w-[12rem] flex-wrap gap-1">
                    {r.tags.map((tag) => (
                      <span key={tag} className="rounded bg-edge px-1.5 py-0.5 text-[11px] text-muted">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-right tabular-nums">{num(r.orders)}</td>
                <td className="p-3 text-right tabular-nums">{r.revenue ? money(r.revenue) : '—'}</td>
                <td className="p-3 text-right text-xs text-muted">{ago(r.last_inbound_at, t)}</td>
                <td className="p-3">
                  <div className="flex flex-col items-end gap-1">
                    {r.conversation_id && (
                      <Link href={`/inbox/${r.conversation_id}`} className="btn text-xs">{t('cu_open_chat')}</Link>
                    )}
                    <ProfileEditor
                      contactId={r.contact_id}
                      initial={{ tags: r.tags, notes: r.notes ?? '', phone: r.phone ?? '' }}
                      labels={{
                        edit: t('cu_edit'), tagsPh: t('cu_tags_ph'), notesPh: t('cu_notes_ph'),
                        phone: t('cu_phone'), save: t('cu_save'), cancel: t('cu_cancel'), saved: t('cu_saved'),
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} className="p-8 text-center text-muted">{t('cu_empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
