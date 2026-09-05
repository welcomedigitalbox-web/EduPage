import Link from 'next/link';
import { admin } from '@/lib/supabase';
import { followUpQueue } from '@/lib/queries';
import { StageBadge, ago } from '@/components/ui';
import { FollowUpActions } from '@/components/ThreadActions';
import { ctx } from '@/lib/server-ctx';
import { STAGE_KEY } from '@/lib/i18n';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function FollowUps() {
  const { t } = await ctx();
  const rows = await followUpQueue();
  const contactIds = rows.map((r) => r.contact_id);
  const { data: convos } = contactIds.length
    ? await admin().from('msgr_conversations').select('id,contact_id').in('contact_id', contactIds)
    : { data: [] as { id: string; contact_id: string }[] };
  const convoOf = new Map((convos ?? []).map((c) => [c.contact_id, c.id]));

  const now = new Date();
  const overdue = rows.filter((r) => new Date(r.due_at) <= now);
  const later = rows.filter((r) => new Date(r.due_at) > now);
  const actions = { done: t('fu_done'), snooze: t('fu_snooze'), cancel: t('fu_cancel') };

  function Section({
    title, list, urgent,
  }: { title: string; list: Record<string, unknown>[]; urgent?: boolean }) {
    return (
      <section>
        <div className={`label mb-2 ${urgent ? 'text-warn' : ''}`}>{title}</div>
        <div className="card divide-y divide-edge">
          {list.map((r) => {
            const c = r.msgr_contacts as {
              id: string; name: string | null; psid: string; stage: LeadStage;
              phone: string | null; last_inbound_at: string | null;
            };
            const cid = convoOf.get(String(r.contact_id));
            return (
              <div key={String(r.id)} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    {cid
                      ? <Link href={`/inbox/${cid}`} className="hover:text-brand">{c?.name ?? `PSID ${c?.psid?.slice(-6)}`}</Link>
                      : <span>{c?.name ?? '—'}</span>}
                    {c && <StageBadge stage={c.stage} label={t(STAGE_KEY[c.stage] ?? c.stage)} />}
                    {Number(r.priority) === 1 &&
                      <span className="rounded bg-bad/20 px-1.5 text-[11px] text-bad">{t('fu_urgent')}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{String(r.reason)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {t('fu_phone_last', { p: c?.phone ?? '—', t: ago(c?.last_inbound_at ?? null, t) })}
                  </div>
                </div>
                <FollowUpActions id={String(r.id)} labels={actions} />
              </div>
            );
          })}
          {!list.length && <div className="p-6 text-center text-sm text-muted">{t('fu_empty')}</div>}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t('fu_title')}</h1>
        <p className="text-sm text-muted">{t('fu_sub')}</p>
      </div>
      <Section title={t('fu_now', { n: overdue.length })} list={overdue} urgent />
      <Section title={t('fu_later', { n: later.length })} list={later} />
    </div>
  );
}
