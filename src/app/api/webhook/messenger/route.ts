import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { admin } from '@/lib/supabase';
import { verifySignature, fetchProfile } from '@/lib/meta';
import {
  upsertContact, getOrCreateConversation, recordMessage,
  closeFollowUps, type Referral,
} from '@/lib/crm';
import { runBotTurn } from '@/lib/bot';

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

  await runBotTurn({
    contact: contact as never,
    convo: { ...convo, inbound_count: convo.inbound_count + 1 } as never,
    sentAt,
    text,
    hasAttachments: attachments.length > 0,
  });
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
