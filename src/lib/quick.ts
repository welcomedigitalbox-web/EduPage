/**
 * Messages that do not need a model. A third of Messenger traffic is "hi",
 * "ok", "thanks" and stickers — paying for a language model to answer those is
 * the single most avoidable cost in the system.
 *
 * Deliberately conservative: anything with a digit, a question mark, or more
 * than a few words falls through to the model. A missed shortcut costs a
 * fraction of a cent; a wrong shortcut costs a customer.
 */

const GREETING = [
  'hi', 'hello', 'hey', 'hlo', 'yo',
  'မင်္ဂလာပါ', 'မဂျလာပါ', 'ဟိုင်း', 'ဟယ်လို', 'ဟလို',
];

const THANKS = [
  'thanks', 'thank you', 'thx', 'ty', 'tks',
  'ကျေးဇူး', 'ကျေးဇူးပါ', 'ကျေးဇူးတင်ပါတယ်', 'ကျေးဇူးဘဲ', 'ကျေးဇူးပဲ',
];

const ACK = [
  'ok', 'okay', 'oke', 'okie', 'k', 'yes', 'yeah', 'noted', 'got it',
  'ဟုတ်', 'ဟုတ်ကဲ့', 'ဟုတ်ပါ', 'အိုကေ', 'ရပါပြီ', 'သိပြီ',
];

/** Strip punctuation and emoji so "Hi!!! 😊" matches "hi". */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[!.?,;:~"'()\-_*]/g, '')
    .trim();
}

export type QuickKind = 'greeting' | 'thanks' | 'ack';

export function quickReply(
  text: string | null,
  opts: { businessName: string; isFirstMessage: boolean; greeting?: string | null }
): { kind: QuickKind; reply: string } | null {
  if (!text) return null;
  const t = normalise(text);

  // Anything substantive — a number, a question, a sentence — needs the model.
  if (!t || t.length > 24 || /\d/.test(t) || text.includes('?') || text.includes('?')) return null;
  if (t.split(/\s+/).length > 4) return null;

  const hit = (list: string[]) => list.some((w) => t === w || t.startsWith(w) || t.endsWith(w));

  if (hit(GREETING)) {
    return {
      kind: 'greeting',
      reply: opts.greeting?.trim()
        || `မင်္ဂလာပါရှင် 🙏 ${opts.businessName} ကပါ။ ဘာလေးများ စိတ်ဝင်စားလဲရှင်?`,
    };
  }
  if (hit(THANKS)) {
    return { kind: 'thanks', reply: 'ကျေးဇူးတင်ပါတယ်ရှင် 🙏 နောက်ထပ် သိချင်တာရှိရင် ပြောပါနော်။' };
  }
  // An acknowledgement mid-conversation needs no reply at all; one at the very
  // start is really a greeting.
  if (hit(ACK)) {
    if (opts.isFirstMessage) return null;
    return { kind: 'ack', reply: 'ဟုတ်ကဲ့ရှင် 🙏 နောက်ထပ် လိုအပ်တာရှိရင် ပြောပါနော်။' };
  }
  return null;
}
