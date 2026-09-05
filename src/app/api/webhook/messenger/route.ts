import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { admin } from '@/lib/supabase';
import { verifySignature, sendText, senderAction, fetchProfile } from '@/lib/meta';
import { decide } from '@/lib/ai';
import {
  upsertContact, getOrCreateConversation, recordMessage, getSettings, getKb,
  recentHistory, setStage, handoffToHuman, scheduleFollowUp, closeFollowUps,
  preflightHandoff, type Referral,
} from '@/lib/crm';
import type { LeadStage } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- 1. Webhook verification handshake ----------
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === env.fbVerifyToken()) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

// ---------- 2. Incoming events ----------
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new NextResponse('bad signature', { status: 401 });
  }

  const body = JSON.parse(raw) as {
    object?: string;
    entry?: { id: string; messaging?: MessagingEvent[] }[];
  };
  if (body.object !== 'page') return NextResponse.json({ ok: true });

  // Meta retries anything that does not 200 within ~20s, so acknowledge first
  // and process afterwards. On Vercel, `waitUntil` keeps the function alive.
  const work = (async () => {
    for (const entry of body.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        try {
          await handleEvent(entry.id, ev);
        } catch (e) {
          console.error('[webhook] event failed', e);
        }
      }
    }
  })();

  // @ts-expect-error waitUntil exists on the Vercel runtime
  if (typeof req.waitUntil === 'function') req.waitUntil(work);
  else await work;

  return NextResponse.json({ ok: true });
}

interface MessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number;
    attachments?: { type: string; payload?: { url?: string } }[];
    quick_reply?: { payload?: string };
  };
  postback?: { title?: string; payload?: string; referral?: Referral };
  referral?: Referral;
  read?: unknown;
  delivery?: unknown;
}

async function handleEvent(pageId: string, ev: MessagingEvent) {
  if (ev.read || ev.delivery) return;

  // --- Echo: a message the Page sent. Could be a human replying in the
  //     Meta inbox instead of our dashboard — record it and pause the bot. ---
  if (ev.message?.is_echo) return handleEcho(pageId, ev);

  const psid = ev.sender?.id;
  if (!psid || psid === pageId) return;

  const referral = ev.referral ?? ev.postback?.referral;
  const contact = await upsertContact(pageId, psid, referral);
  const convo = await getOrCreateConversation(contact.id);
  const db = admin();

  // Fill in the profile once, lazily.
  if (!contact.name) {
    const profile = await fetchProfile(psid);
    if (profile) await db.from('msgr_contacts').update(profile).eq('id', contact.id);
  }

  const text = ev.message?.text ?? ev.postback?.title ?? null;
  const attachments = ev.message?.attachments ?? [];
  const sentAt = ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString();

  const isNew = await recordMessage({
    conversationId: convo.id,
    contactId: contact.id,
    mid: ev.message?.mid ?? null,
    direction: 'in',
    author: 'customer',
    text,
    attachments,
    referral: referral ?? null,
    sentAt,
  });
  if (!isNew) return; // duplicate webhook delivery

  await db.from('msgr_conversations').update({
    inbound_count: convo.inbound_count + 1,
    last_message_at: sentAt,
    last_inbound_at: sentAt,
    // a customer replying re-opens a closed thread
    status: convo.status === 'closed' ? 'bot_handling' : convo.status,
  }).eq('id', convo.id);
  await db.from('msgr_contacts').update({ last_inbound_at: sentAt }).eq('id', contact.id);

  // The customer answered, so any pending "chase them" task is done.
  await closeFollowUps(contact.id);

  const settings = await getSettings();

  // Only the CURRENT status gags the bot. Counting past human replies would
  // mute a thread forever — including when the Page's own auto-reply fires.
  if (convo.status === 'human_handling') {
    await db.from('msgr_conversations').update({
      status: 'needs_human',
      needs_human_since: convo.needs_human_since ?? sentAt,
      needs_human_reason: convo.needs_human_reason ?? 'customer replied to a human-handled thread',
    }).eq('id', convo.id);
    return;
  }

  // `needs_human` with no human reply yet is a to-do for staff, not a gag on
  // the bot. If the next question is one the bot can answer from the knowledge
  // base, answering beats leaving the customer waiting for a busy shop.

  const guard = preflightHandoff(settings, text, convo, attachments.length > 0);
  if (guard) {
    await handoffToHuman(convo.id, guard);
    await scheduleFollowUp({
      contactId: contact.id, hours: 0, reason: `Bot handed off: ${guard}`, priority: 1,
    });
    return;
  }

  // --- Ask the model ---
  await senderAction(psid, 'mark_seen');
  await senderAction(psid, 'typing_on');

  const history = await recentHistory(convo.id);
  const decision = await decide({ settings, kb: await getKb(settings), history, customerName: contact.name });

  await db.from('msgr_ai_runs').insert({
    conversation_id: convo.id,
    model: decision.usage.model,
    intent: decision.intent,
    confidence: decision.confidence,
    action: decision.needs_human ? 'handoff' : 'replied',
    handoff_reason: decision.handoff_reason,
    input_tokens: decision.usage.input_tokens,
    output_tokens: decision.usage.output_tokens,
    latency_ms: decision.usage.latency_ms,
  });

  // Save anything useful the model pulled out of the message.
  const patch: Record<string, unknown> = {};
  if (decision.extracted.phone) patch.phone = decision.extracted.phone;
  if (decision.extracted.address) patch.address = decision.extracted.address;
  if (decision.extracted.name && !contact.name) patch.name = decision.extracted.name;
  if (!contact.store_id && settings.default_store_id) patch.store_id = settings.default_store_id;
  if (Object.keys(patch).length) await db.from('msgr_contacts').update(patch).eq('id', contact.id);

  // A draft basket the model assembled from live POS ids. It is NOT an order —
  // staff review it in the dashboard and press the button that writes the sale.
  if (decision.extracted.items?.length) {
    await db.from('msgr_conversations')
      .update({ needs_human_reason: 'ဖောက်သည်က မှာယူပြီ — order အတည်ပြုပေးရန်' })
      .eq('id', convo.id);
    await db.from('msgr_messages').insert({
      conversation_id: convo.id, contact_id: contact.id,
      direction: 'out', author: 'system', text: null,
      ai: { draft_order: decision.extracted.items },
    });
  }

  await setStage(contact.id, contact.stage as LeadStage, decision.stage, `AI: ${decision.intent}`, 'bot');

  const lowConfidence = decision.confidence < settings.min_confidence;
  const handoff = decision.needs_human || lowConfidence || !decision.reply.trim();
  const reason = decision.needs_human
    ? decision.handoff_reason || `AI flagged: ${decision.intent}`
    : lowConfidence
    ? `low confidence (${decision.confidence.toFixed(2)} < ${settings.min_confidence})`
    : 'AI produced no reply';

  if (decision.reply.trim()) {
    try {
      const sent = await sendText(psid, decision.reply);
      await recordMessage({
        conversationId: convo.id,
        contactId: contact.id,
        mid: sent.message_id ?? null,
        direction: 'out',
        author: 'bot',
        text: decision.reply,
        ai: {
          intent: decision.intent,
          confidence: decision.confidence,
          model: decision.usage.model,
          handoff: handoff,
        },
      });
      const now = new Date().toISOString();
      await db.from('msgr_conversations').update({
        outbound_count: convo.outbound_count + 1,
        bot_reply_count: convo.bot_reply_count + 1,
        last_reply_by: 'bot',
        last_message_at: now,
        first_response_seconds:
          convo.first_response_seconds ??
          Math.round((Date.now() - new Date(sentAt).getTime()) / 1000),
      }).eq('id', convo.id);
      await db.from('msgr_contacts').update({ last_outbound_at: now }).eq('id', contact.id);
    } catch (e) {
      console.error('[webhook] send failed', e);
      await handoffToHuman(convo.id, 'send failed — check the page token');
    }
  }

  await senderAction(psid, 'typing_off');

  if (handoff) {
    await handoffToHuman(convo.id, reason);
    await scheduleFollowUp({ contactId: contact.id, hours: 0, reason, priority: 1 });
  } else if (decision.follow_up.needed) {
    await scheduleFollowUp({
      contactId: contact.id,
      hours: decision.follow_up.hours ?? settings.follow_up_hours,
      reason: decision.follow_up.reason ?? 'Customer went quiet mid-conversation',
    });
  }
}

/** A Page-side message we did not send ourselves — i.e. staff replied in the
 *  Meta/Business Suite inbox. Log it and stop the bot from double-replying. */
async function handleEcho(pageId: string, ev: MessagingEvent) {
  const psid = ev.recipient?.id;
  if (!psid) return;
  const db = admin();
  const { data: contact } = await db
    .from('msgr_contacts').select('*').eq('page_id', pageId).eq('psid', psid).maybeSingle();
  if (!contact) return;
  const convo = await getOrCreateConversation(contact.id);

  const text = ev.message?.text ?? null;
  // Our own dashboard sends already store their message; skip if the mid matches.
  const inserted = await recordMessage({
    conversationId: convo.id,
    contactId: contact.id,
    mid: ev.message?.mid ?? null,
    direction: 'out',
    author: 'human',
    text,
    attachments: ev.message?.attachments ?? [],
  });
  if (!inserted) return;

  const now = new Date().toISOString();
  await db.from('msgr_conversations').update({
    status: 'human_handling',
    last_reply_by: 'human',
    outbound_count: convo.outbound_count + 1,
    human_reply_count: convo.human_reply_count + 1,
    last_message_at: now,
    needs_human_reason: null,
    needs_human_since: null,
  }).eq('id', convo.id);
  await closeFollowUps(contact.id);
}
