import { notFound } from 'next/navigation';
import { conversationDetail } from '@/lib/queries';
import { StageBadge, HandlerBadge, ago, money } from '@/components/ui';
import { ReplyBox, StagePicker, StatusButtons, OrderButton } from '@/components/ThreadActions';
import type { LeadStage } from '@/lib/types';

interface DraftLine {
  product_id: string; variant_id: string | null; product_name: string;
  qty: number; unit_price: number;
}

export const dynamic = 'force-dynamic';

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await conversationDetail(id);
  if (!data) notFound();
  const { convo, messages, events } = data;

  // The most recent basket the AI assembled from live POS ids, if any.
  const draftOrder = [...messages].reverse()
    .map((m) => (m.ai as { draft_order?: DraftLine[] } | null)?.draft_order)
    .find((d): d is DraftLine[] => Array.isArray(d) && d.length > 0);
  const c = convo.msgr_contacts as unknown as {
    id: string; name: string | null; psid: string; stage: LeadStage; phone: string | null;
    address: string | null; source_type: string | null; source_ad_id: string | null;
    first_seen_at: string; tags: string[]; customer_id: string | null;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="card flex h-[calc(100vh-3rem)] flex-col">
        <div className="flex items-center justify-between border-b border-edge p-3">
          <div>
            <div className="font-medium">{c.name ?? `PSID ${c.psid.slice(-6)}`}</div>
            <div className="mt-1 flex items-center gap-2">
              <StageBadge stage={c.stage} />
              <HandlerBadge by={convo.last_reply_by} />
            </div>
          </div>
          <StatusButtons conversationId={convo.id} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.filter((m) => m.author !== 'system').map((m) => {
            const mine = m.direction === 'out';
            const bg = !mine ? 'bg-edge' : m.author === 'bot' ? 'bg-[#3987e5]/20' : 'bg-good/15';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${bg}`}>
                  {m.text ?? <span className="italic text-muted">(ပုံ/ဖိုင်)</span>}
                  <div className="mt-1 text-[10px] text-muted">
                    {m.author === 'bot' ? '🤖 Bot' : m.author === 'human' ? '👤 လူ' : ''}
                    {m.ai && typeof m.ai === 'object' && 'confidence' in (m.ai as object)
                      ? ` · ${Math.round(Number((m.ai as Record<string, unknown>).confidence) * 100)}% · ${String((m.ai as Record<string, unknown>).intent ?? '')}`
                      : ''}
                    {' · '}{new Date(m.sent_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
          {!messages.length && <div className="text-center text-sm text-muted">စာမရှိသေးပါ</div>}
        </div>

        <ReplyBox conversationId={convo.id} />
      </div>

      <aside className="space-y-4">
        {convo.status === 'needs_human' && (
          <div className="card border-warn/50 p-3 text-sm">
            <div className="label text-warn">လူ လိုက်စစ်ရန်</div>
            <p className="mt-1">{convo.needs_human_reason}</p>
            <p className="mt-1 text-xs text-muted">စောင့်နေတာ {ago(convo.needs_human_since)}</p>
          </div>
        )}

        <div className="card space-y-2 p-3 text-sm">
          <div className="label">ဖောက်သည် အချက်အလက်</div>
          <Row k="Stage" v={<StagePicker contactId={c.id} stage={c.stage} />} />
          <Row k="ဖုန်း" v={c.phone ?? '—'} />
          <Row k="လိပ်စာ" v={c.address ?? '—'} />
          <Row k="ဘယ်ကလာ" v={c.source_type ?? 'organic'} />
          <Row k="Ad ID" v={c.source_ad_id ?? '—'} />
          <Row k="POS customer" v={c.customer_id ? "ချိတ်ပြီး" : "မချိတ်ရသေး"} />
          <Row k="ပထမဆုံးရောက်" v={new Date(c.first_seen_at).toLocaleDateString()} />
          <Row k="စာအရေအတွက်" v={`${convo.inbound_count}↓ / ${convo.outbound_count}↑`} />
          <Row k="Bot ဖြေ / လူဖြေ" v={`${convo.bot_reply_count} / ${convo.human_reply_count}`} />
        </div>

        <OrderButton contactId={c.id} draft={draftOrder} />

        <div className="card p-3">
          <div className="label mb-2">Stage မှတ်တမ်း</div>
          <ul className="space-y-1 text-xs text-muted">
            {events.map((e) => (
              <li key={e.id}>
                {e.from_stage ?? '—'} → <span className="text-white">{e.to_stage}</span> · {e.reason}
                <span className="ml-1">({ago(e.created_at)})</span>
              </li>
            ))}
            {!events.length && <li>မှတ်တမ်းမရှိသေးပါ</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted">{k}</span>
      <span className="text-right text-xs">{v}</span>
    </div>
  );
}
