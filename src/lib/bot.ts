import { admin } from './supabase';
import { sendText, senderAction } from './meta';
import { decide } from './ai';
import {
  getSettings, getKb, recentHistory, setStage, handoffToHuman,
  scheduleFollowUp, preflightHandoff,
} from './crm';
import type { LeadStage } from './types';

interface TurnArgs {
  contact: { id: string; psid: string; name: string | null; stage: string; store_id?: string | null };
  convo: {
    id: string; status: string; outbound_count: number; bot_reply_count: number;
    inbound_count: number; first_response_seconds: number | null;
    needs_human_since: string | null; needs_human_reason: string | null;
  };
  /** timestamp of the customer message we are answering */
  sentAt: string;
  /** latest customer text, for the deterministic pre-flight guard */
  text?: string | null;
  hasAttachments?: boolean;
  /** staff pressed "let the bot answer" — skip the keyword/turn guards */
  force?: boolean;
}

/**
 * One bot turn: read the thread, ask the model, send the reply, record
 * everything. Used by the webhook when a customer writes in, and by the
 * dashboard when staff hand a thread back to the bot — so the button
 * actually produces an answer instead of only flipping a status.
 */
export async function runBotTurn(args: TurnArgs): Promise<{ replied: boolean; reason?: string }> {
  const { contact, convo, sentAt } = args;
  const db = admin();
  const settings = await getSettings();

  /** Never leave a customer staring at silence: when the bot cannot answer,
   *  say a human will pick it up. Skipped if we just said it. */
  async function sayHolding() {
    const msg = (settings.handoff_message ?? '').trim();
    if (!msg) return;
    const { data: last } = await db
      .from('msgr_messages').select('text,direction')
      .eq('conversation_id', convo.id).order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (last?.direction === 'out' && last?.text?.trim() === msg) return;
    try {
      const sent = await sendText(contact.psid, msg);
      const { recordMessage } = await import('./crm');
      await recordMessage({
        conversationId: convo.id, contactId: contact.id,
        mid: sent.message_id ?? null, direction: 'out', author: 'bot',
        text: msg, ai: { holding: true },
      });
      const now = new Date().toISOString();
      await db.from('msgr_conversations').update({
        outbound_count: convo.outbound_count + 1, last_message_at: now,
      }).eq('id', convo.id);
      await db.from('msgr_contacts').update({ last_outbound_at: now }).eq('id', contact.id);
    } catch (e) {
      console.error('[bot] holding message failed', e);
    }
  }

  if (!settings.is_enabled && !args.force) return { replied: false, reason: 'bot disabled' };

  if (!args.force) {
    const guard = preflightHandoff(settings, args.text ?? null, convo as never, !!args.hasAttachments);
    if (guard) {
      await handoffToHuman(convo.id, guard);
      await sayHolding();
      await scheduleFollowUp({
        contactId: contact.id, hours: 0, reason: `Bot handed off: ${guard}`, priority: 1,
      });
      return { replied: false, reason: guard };
    }
  }

  await senderAction(contact.psid, 'mark_seen');
  await senderAction(contact.psid, 'typing_on');

  const history = await recentHistory(convo.id);
  const decision = await decide({
    settings, kb: await getKb(settings), history, customerName: contact.name,
  });

  await db.from('msgr_ai_runs').insert({
    conversation_id: convo.id,
    model: decision.usage.model,
    intent: decision.intent,
    confidence: decision.confidence,
    action: decision.needs_human ? 'handoff' : 'replied',
    handoff_reason: decision.handoff_reason,
    input_tokens: decision.usage.input_tokens,
    output_tokens: decision.usage.output_tokens,
    cache_read_tokens: decision.usage.cache_read_tokens,
    cache_write_tokens: decision.usage.cache_write_tokens,
    latency_ms: decision.usage.latency_ms,
  });

  const patch: Record<string, unknown> = {};
  if (decision.extracted.phone) patch.phone = decision.extracted.phone;
  if (decision.extracted.address) patch.address = decision.extracted.address;
  if (decision.extracted.name && !contact.name) patch.name = decision.extracted.name;
  if (!contact.store_id && settings.default_store_id) patch.store_id = settings.default_store_id;
  if (Object.keys(patch).length) await db.from('msgr_contacts').update(patch).eq('id', contact.id);

  // A draft basket assembled from live POS ids. Not an order — staff confirm it.
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

  let replied = false;
  if (decision.reply.trim()) {
    try {
      const sent = await sendText(contact.psid, decision.reply);
      const { recordMessage } = await import('./crm');
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
          handoff,
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
      replied = true;
    } catch (e) {
      console.error('[bot] send failed', e);
      await handoffToHuman(convo.id, 'send failed — check the page token');
      await senderAction(contact.psid, 'typing_off');
      return { replied: false, reason: 'send failed' };
    }
  }

  await senderAction(contact.psid, 'typing_off');

  if (handoff) {
    await handoffToHuman(convo.id, reason);
    await sayHolding();
    await scheduleFollowUp({ contactId: contact.id, hours: 0, reason, priority: 1 });
  } else if (decision.follow_up.needed) {
    await scheduleFollowUp({
      contactId: contact.id,
      hours: decision.follow_up.hours ?? settings.follow_up_hours,
      reason: decision.follow_up.reason ?? 'Customer went quiet mid-conversation',
    });
  }

  return { replied, reason: handoff ? reason : undefined };
}
