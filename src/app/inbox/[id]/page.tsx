import { notFound } from 'next/navigation';
import { conversationDetail } from '@/lib/queries';
import { StageBadge, HandlerBadge, ago } from '@/components/ui';
import { ReplyBox, StagePicker, StatusButtons, OrderButton, PosCustomerBox } from '@/components/ThreadActions';
import { ctx } from '@/lib/server-ctx';
import { STAGE_KEY } from '@/lib/i18n';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface DraftLine {
  product_id: string; variant_id: string | null; product_name: string;
  qty: number; unit_price: number;
}

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { t, lang } = await ctx();
  const { id } = await params;
  const data = await conversationDetail(id);
  if (!data) notFound();
  const { convo, messages, events } = data;

  const draftOrder = [...messages].reverse()
    .map((m) => (m.ai as { draft_order?: DraftLine[] } | null)?.draft_order)
    .find((d): d is DraftLine[] => Array.isArray(d) && d.length > 0);

  const c = convo.msgr_contacts as unknown as {
    id: string; name: string | null; psid: string; stage: LeadStage; phone: string | null;
    address: string | null; source_type: string | null; source_ad_id: string | null;
    first_seen_at: string; tags: string[]; customer_id: string | null;
    email: string | null;
  };
  const handler = { bot: t('ib_by_bot'), human: t('ib_by_human'), none: t('ib_by_none') };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="card flex h-[calc(100vh-3rem)] flex-col">
        <div className="flex items-center justify-between border-b border-edge p-3">
          <div>
            <div className="font-medium">{c.name ?? `PSID ${c.psid.slice(-6)}`}</div>
            <div className="mt-1 flex items-center gap-2">
              <StageBadge stage={c.stage} label={t(STAGE_KEY[c.stage] ?? c.stage)} />
              <HandlerBadge by={convo.last_reply_by} labels={handler} />
            </div>
          </div>
          <StatusButtons conversationId={convo.id}
            labels={{ bot: t('th_give_bot'), mine: t('th_take'), close: t('th_close') }} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.filter((m) => m.author !== 'system').map((m) => {
            const mine = m.direction === 'out';
            const bg = !mine ? 'bg-edge' : m.author === 'bot' ? 'bg-[#3987e5]/20' : 'bg-good/15';
            const ai = m.ai as Record<string, unknown> | null;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${bg}`}>
                  <Attachments items={m.attachments as Attachment[] | null} label={t('th_attachment')} />
                  {m.text}
                  <div className="mt-1 text-[10px] text-muted">
                    {m.author === 'bot'
                      ? t('ib_by_bot')
                      : m.author === 'human'
                      ? `${t('ib_by_human')}${ai?.replied_by ? ` · ${String(ai.replied_by)}` : ''}`
                      : ''}
                    {ai && 'confidence' in ai
                      ? ` · ${Math.round(Number(ai.confidence) * 100)}% · ${String(ai.intent ?? '')}`
                      : ''}
                    {' · '}{new Date(m.sent_at).toLocaleString(lang === 'en' ? 'en-GB' : 'my-MM')}
                  </div>
                </div>
              </div>
            );
          })}
          {!messages.length && <div className="text-center text-sm text-muted">{t('th_no_messages')}</div>}
        </div>

        <ReplyBox conversationId={convo.id}
          labels={{
            placeholder: t('th_reply_ph'), send: t('th_send'), hint: t('th_send_hint'),
            failed: t('th_send_failed'), attach: t('th_attach'), uploading: t('th_uploading'),
            remove: t('th_remove'), tooLarge: t('th_too_large'),
          }} />
      </div>

      <aside className="space-y-4">
        {convo.status === 'needs_human' && (
          <div className="card border-warn/50 p-3 text-sm">
            <div className="label text-warn">{t('th_needs_human')}</div>
            <p className="mt-1">{convo.needs_human_reason}</p>
            <p className="mt-1 text-xs text-muted">{t('th_waiting', { t: ago(convo.needs_human_since, t) })}</p>
          </div>
        )}

        <div className="card space-y-2 p-3 text-sm">
          <div className="label">{t('th_details')}</div>
          <Row k={t('ib_stage')} v={<StagePicker contactId={c.id} stage={c.stage}
            options={Object.entries(STAGE_KEY).map(([k, key]) => ({ value: k, label: t(key) }))} />} />
          <Row k={t('th_phone')} v={c.phone ?? '—'} />
          <Row k={t('th_address')} v={c.address ?? '—'} />
          <Row k={t('th_source')} v={c.source_type ?? 'organic'} />
          <Row k={t('th_ad_id')} v={c.source_ad_id ?? '—'} />
          <Row k={t('th_pos_customer')} v={c.customer_id ? t('th_linked') : t('th_not_linked')} />
          <Row k={t('th_first_seen')} v={new Date(c.first_seen_at).toLocaleDateString()} />
          <Row k={t('th_counts')} v={`${convo.inbound_count}↓ / ${convo.outbound_count}↑`} />
          <Row k={t('th_bot_human')} v={`${convo.bot_reply_count} / ${convo.human_reply_count}`} />
        </div>

        <PosCustomerBox
          contactId={c.id}
          customerId={c.customer_id}
          labels={{
            title: t('th_pos_customer'), create: t('th_pos_create'),
            open: t('th_pos_open'), linked: t('th_linked'), notLinked: t('th_not_linked'),
          }}
        />

        <OrderButton contactId={c.id} draft={draftOrder} labels={{
          open: t('or_open'), prefilled: t('or_prefilled', { n: draftOrder?.length ?? 0 }),
          title: t('or_title'), search: t('or_search'), out: t('or_out_of_stock'),
          left: t('or_in_stock', { n: '' }), total: t('or_total'), save: t('or_save'),
          cancel: t('or_cancel'), failed: t('or_failed'), note: t('or_note'),
          store: t('or_store'), storeAuto: t('or_store_auto'),
          stockHere: t('or_stock_here', { n: '{n}' }),
          stockTotal: t('or_stock_total', { n: '{n}' }),
          notEnough: t('or_not_enough'),
        }} />

        <div className="card p-3">
          <div className="label mb-2">{t('th_history')}</div>
          <ul className="space-y-1 text-xs text-muted">
            {events.map((e) => (
              <li key={e.id}>
                {e.from_stage ?? '—'} → <span className="text-white">{e.to_stage}</span> · {e.reason}
                <span className="ml-1">({ago(e.created_at, t)})</span>
              </li>
            ))}
            {!events.length && <li>{t('th_no_history')}</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}

interface Attachment { type?: string; payload?: { url?: string } }

/** Photos and files as the customer sent them. Meta's CDN links expire after
 *  a while, so an old picture may fail to load — the link still opens it in a
 *  new tab while Facebook keeps it. */
function Attachments({ items, label }: { items: Attachment[] | null; label: string }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div className="mb-1 space-y-1">
      {items.map((a, i) => {
        const url = a.payload?.url;
        if (!url) return <span key={i} className="italic text-muted">{label}</span>;
        if (a.type === 'image') {
          return (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="max-h-64 rounded-lg object-contain" />
            </a>
          );
        }
        if (a.type === 'audio' || a.type === 'video') {
          return a.type === 'audio'
            ? <audio key={i} controls src={url} className="w-56" />
            : <video key={i} controls src={url} className="max-h-64 rounded-lg" />;
        }
        return (
          <a key={i} href={url} target="_blank" rel="noreferrer"
             className="text-xs underline hover:text-brand">{a.type ?? label}</a>
        );
      })}
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
