import Link from 'next/link';
import { admin } from '@/lib/supabase';
import { followUpQueue } from '@/lib/queries';
import { StageBadge, ago } from '@/components/ui';
import { FollowUpActions } from '@/components/ThreadActions';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function FollowUps() {
  const rows = await followUpQueue();
  const contactIds = rows.map((r) => r.contact_id);
  const { data: convos } = contactIds.length
    ? await admin().from('conversations').select('id,contact_id').in('contact_id', contactIds)
    : { data: [] as { id: string; contact_id: string }[] };
  const convoOf = new Map((convos ?? []).map((c) => [c.contact_id, c.id]));

  const overdue = rows.filter((r) => new Date(r.due_at) <= new Date());
  const later = rows.filter((r) => new Date(r.due_at) > new Date());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Follow-up စာရင်း</h1>
        <p className="text-sm text-muted">
          လူကိုယ်တိုင် လိုက်စစ်ရမယ့်သူတွေ — ဒီစာရင်းက အလိုအလျောက် ထွက်လာတာပါ
        </p>
      </div>

      <Section title={`အခုလုပ်ရမယ် (${overdue.length})`} rows={overdue} convoOf={convoOf} urgent />
      <Section title={`နောက်မှ (${later.length})`} rows={later} convoOf={convoOf} />
    </div>
  );
}

function Section({
  title, rows, convoOf, urgent,
}: {
  title: string;
  rows: Record<string, unknown>[];
  convoOf: Map<string, string>;
  urgent?: boolean;
}) {
  return (
    <section>
      <div className={`label mb-2 ${urgent ? 'text-warn' : ''}`}>{title}</div>
      <div className="card divide-y divide-edge">
        {rows.map((r) => {
          const c = r.contacts as { id: string; name: string | null; psid: string; stage: LeadStage; phone: string | null; last_inbound_at: string | null };
          const cid = convoOf.get(String(r.contact_id));
          return (
            <div key={String(r.id)} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  {cid
                    ? <Link href={`/inbox/${cid}`} className="hover:text-brand">{c?.name ?? `PSID ${c?.psid?.slice(-6)}`}</Link>
                    : <span>{c?.name ?? '—'}</span>}
                  {c && <StageBadge stage={c.stage} />}
                  {Number(r.priority) === 1 && <span className="rounded bg-bad/20 px-1.5 text-[11px] text-bad">အရေးကြီး</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">{String(r.reason)}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  ဖုန်း {c?.phone ?? '—'} · နောက်ဆုံးစာ {ago(c?.last_inbound_at ?? null)} က
                </div>
              </div>
              <FollowUpActions id={String(r.id)} />
            </div>
          );
        })}
        {!rows.length && <div className="p-6 text-center text-sm text-muted">ဘာမှ မကျန်တော့ပါ 🎉</div>}
      </div>
    </section>
  );
}
