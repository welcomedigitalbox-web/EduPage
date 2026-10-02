import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import { admin } from './supabase';
import { overview, salesReport, adPerformance, dailyFunnel, stageCounts } from './queries';
import { localDay } from './range';

function client() {
  return new Anthropic({ apiKey: env.anthropicKey() });
}

/**
 * The assistant answers from the same queries the dashboard pages use, rather
 * than from free-form SQL: the model cannot invent a metric, and a question it
 * has no tool for gets an honest "I can't see that" instead of a plausible
 * number.
 */
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_overview',
    description:
      'Headline funnel and ad economics for a date range: leads, engaged, orders, revenue (MMK and USD), ad spend (USD), cost per lead, cost per order, ROAS, conversation counts, bot self-service rate.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        until: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
      },
      required: ['since', 'until'],
    },
  },
  {
    name: 'get_sales',
    description:
      'Online sales detail for a date range: order count, revenue, average order value, orders that came from ads, breakdown by store, by order status, by day, and the twenty best-selling products.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
      required: ['since', 'until'],
    },
  },
  {
    name: 'get_ads',
    description:
      'Per-ad performance across all time: spend, impressions, clicks, Meta-reported conversations, leads in our own system, qualified leads, orders, revenue, cost per lead, cost per order and ROAS.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_daily',
    description:
      'Day-by-day series for a range: new contacts, engaged, orders, revenue and ad spend. Use for trends and "which day was busiest" questions.',
    input_schema: {
      type: 'object',
      properties: { since: { type: 'string' }, until: { type: 'string' } },
      required: ['since', 'until'],
    },
  },
  {
    name: 'get_stages',
    description: 'How many contacts first seen in a range sit at each lead stage.',
    input_schema: {
      type: 'object',
      properties: { since: { type: 'string' }, until: { type: 'string' } },
      required: ['since', 'until'],
    },
  },
  {
    name: 'get_page_insights',
    description:
      'Facebook Page performance for a range: followers, new follows, page views, engagements, video views, and the posts published with their reactions, comments, shares, clicks and video views.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        top_posts: { type: 'number', description: 'How many posts to return, best engagement first. Default 10.' },
      },
      required: ['since', 'until'],
    },
  },
  {
    name: 'get_inbox',
    description:
      'Current state of the inbox: how many threads are waiting on a reply, how many the bot flagged for a person, how many follow-up tasks are pending, and the reasons the bot handed threads over.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_lost_leads',
    description:
      "Conversations in a range that never became an order, with the customer's own last words. Use this for \"why did these not buy\" questions: it returns the lead stage, the reason the bot handed the thread to a person, how long the thread ran, and the last few things the customer actually typed. Read the words before drawing a conclusion.",
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'How many conversations to read. Default 40, max 120.' },
      },
      required: ['since', 'until'],
    },
  },
  {
    name: 'search_messages',
    description:
      'Search what customers actually wrote. Give a word or phrase (Burmese or English) and a date range; returns the matching inbound messages with the date, the thread they came from, and whether that customer went on to order. Use it to find what people ask about a product, a price, delivery, or a complaint.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Word or phrase to look for in the message text.' },
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Default 60, max 200.' },
      },
      required: ['q', 'since', 'until'],
    },
  },
  {
    name: 'get_order_lines',
    description:
      'The individual product lines of the orders in a range: barcode, description, quantity, unit price, line total, with the order status and city. Use it for "what exactly did they buy", basket size, and which products travel together.',
    input_schema: {
      type: 'object',
      properties: { since: { type: 'string' }, until: { type: 'string' }, limit: { type: 'number' } },
      required: ['since', 'until'],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const db = admin();
  const since = String(input.since ?? '');
  const until = String(input.until ?? '');

  switch (name) {
    case 'get_overview':
      return overview(since, until);
    case 'get_sales':
      return salesReport(since, until);
    case 'get_ads':
      return (await adPerformance()).slice(0, 50);
    case 'get_daily':
      return dailyFunnel(since, until);
    case 'get_stages':
      return stageCounts(since, until);
    case 'get_page_insights': {
      const [days, posts] = await Promise.all([
        db.from('msgr_page_daily').select('*').gte('date', since).lte('date', until).order('date'),
        db.from('msgr_page_posts').select('*')
          .gte('created_time', `${since}T00:00:00Z`).lte('created_time', `${until}T23:59:59Z`)
          .limit(500),
      ]);
      const rows = (posts.data ?? []) as Record<string, number>[];
      const ranked = rows
        .map((p) => ({ ...p, engagements: Number(p.reactions) + Number(p.comments) + Number(p.shares) }))
        .sort((a, b) => b.engagements - a.engagements)
        .slice(0, Number(input.top_posts ?? 10));
      return { days: days.data ?? [], post_count: rows.length, top_posts: ranked };
    }
    case 'get_inbox': {
      const [convos, tasks] = await Promise.all([
        db.from('msgr_conversations')
          .select('status,last_message_at,last_inbound_at,needs_human_reason')
          .neq('status', 'closed').limit(1000),
        db.from('msgr_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      const rows = convos.data ?? [];
      const reasons: Record<string, number> = {};
      for (const c of rows) {
        if (c.needs_human_reason) reasons[c.needs_human_reason] = (reasons[c.needs_human_reason] ?? 0) + 1;
      }
      return {
        waiting_on_us: rows.filter(
          (c) => c.last_message_at && c.last_inbound_at && c.last_message_at <= c.last_inbound_at
        ).length,
        needs_human: rows.filter((c) => c.status === 'needs_human').length,
        pending_follow_ups: tasks.count ?? 0,
        handoff_reasons: Object.entries(reasons)
          .sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([reason, n]) => ({ reason, n })),
      };
    }
    case 'get_lost_leads': {
      const cap = Math.min(Number(input.limit ?? 40), 120);
      // Threads that started in the window, and the orders that came out of them.
      const [convos, orders] = await Promise.all([
        db.from('msgr_conversations')
          .select('id,contact_id,status,needs_human_reason,inbound_count,outbound_count,first_response_seconds,created_at,last_message_at')
          .gte('created_at', `${since}T00:00:00Z`).lte('created_at', `${until}T23:59:59Z`)
          .order('inbound_count', { ascending: false }).limit(600),
        db.from('msgr_orders').select('conversation_id,contact_id')
          .gte('order_date', since).lte('order_date', until).limit(2000),
      ]);
      const bought = new Set<string>();
      for (const o of orders.data ?? []) {
        if (o.conversation_id) bought.add(String(o.conversation_id));
        if (o.contact_id) bought.add(String(o.contact_id));
      }
      const lost = (convos.data ?? [])
        .filter((c) => !bought.has(String(c.id)) && !bought.has(String(c.contact_id)))
        .slice(0, cap);
      if (!lost.length) return { lost_count: 0, conversations: [] };

      // The customer's own words are the point; the counts alone explain nothing.
      const msgs = await db.from('msgr_messages')
        .select('conversation_id,text,sent_at,direction')
        .in('conversation_id', lost.map((c) => c.id))
        .eq('direction', 'in')
        .order('sent_at', { ascending: false })
        .limit(cap * 6);
      const byConvo = new Map<string, string[]>();
      for (const m of msgs.data ?? []) {
        const k = String(m.conversation_id);
        const arr = byConvo.get(k) ?? [];
        if (arr.length < 4 && m.text) arr.push(String(m.text).slice(0, 400));
        byConvo.set(k, arr);
      }
      return {
        lost_count: lost.length,
        total_started: (convos.data ?? []).length,
        conversations: lost.map((c) => ({
          status: c.status,
          handoff_reason: c.needs_human_reason,
          inbound: c.inbound_count,
          outbound: c.outbound_count,
          first_response_seconds: c.first_response_seconds,
          started: c.created_at,
          last_message_at: c.last_message_at,
          customer_said: (byConvo.get(String(c.id)) ?? []).reverse(),
        })),
      };
    }

    case 'search_messages': {
      const q = String(input.q ?? '').trim();
      if (!q) return { error: 'no search word given' };
      const cap = Math.min(Number(input.limit ?? 60), 200);
      const hits = await db.from('msgr_messages')
        .select('conversation_id,contact_id,text,sent_at')
        .eq('direction', 'in')
        .ilike('text', `%${q}%`)
        .gte('sent_at', `${since}T00:00:00Z`).lte('sent_at', `${until}T23:59:59Z`)
        .order('sent_at', { ascending: false }).limit(cap);
      const rows = hits.data ?? [];
      const ids = [...new Set(rows.map((r) => String(r.contact_id)).filter(Boolean))];
      const orders = ids.length
        ? await db.from('msgr_orders').select('contact_id').in('contact_id', ids).limit(2000)
        : { data: [] as { contact_id: string }[] };
      const bought = new Set((orders.data ?? []).map((o) => String(o.contact_id)));
      return {
        match_count: rows.length,
        messages: rows.map((r) => ({
          sent_at: r.sent_at,
          text: String(r.text ?? '').slice(0, 500),
          customer_ordered: bought.has(String(r.contact_id)),
        })),
      };
    }

    case 'get_order_lines': {
      const cap = Math.min(Number(input.limit ?? 300), 800);
      const ords = await db.from('msgr_orders')
        .select('id,order_no,order_date,status,city,grand_total')
        .gte('order_date', since).lte('order_date', until).limit(cap);
      const list = ords.data ?? [];
      if (!list.length) return { order_count: 0, lines: [] };
      const lines = await db.from('msgr_order_items')
        .select('order_id,barcode,description,qty,unit_price,line_total')
        .in('order_id', list.map((o) => o.id)).limit(3000);
      const head = new Map(list.map((o) => [String(o.id), o]));
      return {
        order_count: list.length,
        lines: (lines.data ?? []).map((l) => {
          const o = head.get(String(l.order_id));
          return {
            order_no: o?.order_no, order_date: o?.order_date, status: o?.status, city: o?.city,
            barcode: l.barcode, description: l.description,
            qty: Number(l.qty), unit_price: Number(l.unit_price), line_total: Number(l.line_total),
          };
        }),
      };
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}

export interface AskTurn { role: 'user' | 'assistant'; content: string }

export interface AskResult {
  answer: string;
  used: string[];
  usage: { input_tokens: number; output_tokens: number; cache_read: number };
}

function systemPrompt(today: string, language: string): string {
  return `You are the analyst for Edu Baby House's online business — the Facebook page, the Messenger inbox, the ads and the orders that come from them. You answer the owner's and the managers' questions about their own data.

TODAY IS ${today}. The shop is in Myanmar (Asia/Yangon). Dates you pass to tools are YYYY-MM-DD and inclusive.

HOW YOU WORK
1. Call the tools. Every figure you write must have come back from a tool in this
   conversation. Never estimate, never carry a number over from an earlier answer,
   never round a figure into a "roughly".
2. One tool call is rarely enough for a real question. Get the period asked for,
   then get the period before it, so you can say whether the number is good or bad.
   A figure with nothing to compare it against is half an answer.
3. Say which days you looked at, in words, every time: "စက်တင်ဘာ ၂၅ ကနေ အောက်တိုဘာ ၁ အထိ".
   If the question names no period, take the last 7 days and say so. If it is
   ambiguous in some other way, state the reading you took in one clause and
   answer it, rather than asking the person to re-phrase.
4. "Why" questions need a comparison, not a description. Put the period against the
   one before it, or one ad against the others, find where the difference actually
   sits, and name it with the number. If the data cannot show why, say which figure
   would be needed and where it would be recorded.
5. If a question needs data no tool provides, say plainly what you cannot see.
   Do not guess, and do not answer a nearby question instead.
6. Zero is an answer. If no sales are recorded, say so and say why it is likely —
   orders are only counted once staff complete them.

WHAT THE NUMBERS MEAN
- Revenue is in MMK; ad spend is in USD, billed by Meta. Always say which is which.
  ROAS already converts revenue to USD at that day's rate, so it is comparable.
- The page's order book is more complete than the shops' tills. Orders taken outside
  this system — on the phone, in person, by another staff account — are not in it.
  If a total looks low against what the owner expects, say that.
- A "lead" is a contact who messaged; "engaged" is one who got past the first reply.
  Do not treat the two as the same number.

WHY A LEAD DID NOT BUY
These questions are the reason get_lost_leads and search_messages exist, and they
are answered by reading, not by counting.
- Pull the lost conversations for the period, read what the customers actually
  wrote, and sort the threads into reasons in their own words: price, stock,
  delivery cost or time, size or colour, no reply / replied too late, just looking,
  bought elsewhere, payment. Invent no category the messages do not support.
- Give a table: reason, how many threads, share of the lost total, and one short
  real quote from a customer for each row. The quote is what makes a manager
  believe the row.
- Separate what the shop did wrong (slow or no reply, no answer about price,
  thread abandoned) from what it could not control (customer only browsing, out
  of budget). Say which group is bigger — that is the whole answer to "can we fix
  it".
- Then, and only then, write a short "ဝန်ထမ်း သင်တန်းအတွက်" list: the two or three
  specific things to say or do differently, each tied to the reason it fixes and
  the number of threads it would have affected. Generic selling advice is worthless
  here; every point must come from a thread you read.
- Reply speed is measurable: first_response_seconds comes back with each thread.
  If slow replies and lost threads line up, say so with the figure.

HOW THE ANSWER LOOKS
7. Write in markdown. Put every set of figures in a markdown pipe table with a header
   row — never as lines of text, never as a bullet per number. Use ## headings once
   an answer runs past a few paragraphs.
8. Lead with the number asked for, in the first sentence. Then the comparison. Then,
   only if it is genuinely useful, one short line of interpretation — a rate, or
   something that looks wrong and is worth checking.
9. Bold the figure that matters. Keep sentences short.
10. The page has Copy, Excel and PDF / Print buttons under every answer, so NEVER say
    you cannot make a file, cannot export, or that the person should paste your text
    into Word. If a document, announcement, report or PDF is asked for, write the
    finished document itself — title, numbered sections, real tables — and end with
    one short line: "အောက်က PDF / Print နှိပ်ပြီး သိမ်းလို့ရပါတယ်။"
11. Answer in ${language === 'en' ? 'English' : 'Burmese'}. Keep the English names of
    metrics, ads, products and stores as they are; do not translate them.
12. End with a short "ရင်းမြစ်:" line naming only the dates and the things you looked
    at (ads, page, orders, inbox) — never tool names, table names or column names.`;
}

export async function ask(history: AskTurn[], language: string): Promise<AskResult> {
  const today = localDay(new Date());
  const system = systemPrompt(today, language);

  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  const used: string[] = [];
  let inTok = 0, outTok = 0, cacheTok = 0;

  // Up to six rounds: enough for a question that needs several tools, bounded
  // so a confused model cannot loop up a bill.
  for (let round = 0; round < 6; round++) {
    const res = await client().messages.create({
      model: env.aiModel(),
      max_tokens: 1500,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    });
    inTok += res.usage.input_tokens;
    outTok += res.usage.output_tokens;
    cacheTok += res.usage.cache_read_input_tokens ?? 0;

    const calls = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    if (!calls.length) {
      const text = res.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text).join('\n').trim();
      return { answer: text, used, usage: { input_tokens: inTok, output_tokens: outTok, cache_read: cacheTok } };
    }

    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      used.push(call.name);
      let out: unknown;
      try {
        out = await runTool(call.name, call.input as Record<string, unknown>);
      } catch (e) {
        out = { error: String(e) };
      }
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(out).slice(0, 60_000),
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return {
    answer: 'ခဏလေး — အဖြေရှာရာမှာ ရှုပ်ထွေးသွားပါတယ်။ မေးခွန်းကို ပိုတိကျအောင် ပြန်မေးကြည့်ပါ။',
    used,
    usage: { input_tokens: inTok, output_tokens: outTok, cache_read: cacheTok },
  };
}

/* ------------------------------------------------------------------ *
 * Streaming
 *
 * The same tools and the same prompt, but the answer is pushed to the
 * browser as it is written rather than held back until the last round.
 * A long answer that appears a line at a time reads as fast; the same
 * answer delivered in one lump after forty seconds reads as broken.
 *
 * The stream is NDJSON — one JSON object per line:
 *   {t:"step", name}        a tool is being called
 *   {t:"delta", text}       another piece of the answer
 *   {t:"rows", name, rows}  the figures that came back, for Excel
 *   {t:"done", used, usage}
 *   {t:"error", message}
 * ------------------------------------------------------------------ */

export interface AskUsage { input_tokens: number; output_tokens: number; cache_read: number }

// Pull anything table-shaped out of a tool result so the browser can offer it
// as a spreadsheet. A bare array is a table; so is an array sitting on a key.
function tablesFrom(name: string, out: unknown): { name: string; rows: Record<string, unknown>[] }[] {
  const found: { name: string; rows: Record<string, unknown>[] }[] = [];
  const ok = (v: unknown) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null;
  if (ok(out)) found.push({ name, rows: out as Record<string, unknown>[] });
  else if (out && typeof out === 'object') {
    for (const [k, v] of Object.entries(out as Record<string, unknown>)) {
      if (ok(v)) found.push({ name: `${name}.${k}`, rows: v as Record<string, unknown>[] });
    }
  }
  return found;
}

export function askStream(
  history: AskTurn[],
  language: string,
  onFinish?: (usage: AskUsage) => void | Promise<void>,
): ReadableStream<Uint8Array> {
  const today = localDay(new Date());
  const system = systemPrompt(today, language);
  const messages: Anthropic.MessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));

  // Thinking is configured by env so the model can be changed without a deploy:
  // newer models take an adaptive budget with an effort level, older ones a fixed
  // token budget, and AI_THINKING_BUDGET=0 turns it off.
  const budget = Number(process.env.AI_THINKING_BUDGET ?? 4000);
  const adaptive = (process.env.AI_THINKING_MODE || 'adaptive') === 'adaptive';
  const thinking = budget <= 0 ? undefined
    : adaptive ? { type: 'adaptive' } : { type: 'enabled', budget_tokens: budget };
  const outputConfig = budget > 0 && adaptive ? { effort: process.env.AI_EFFORT || 'high' } : undefined;

  const enc = new TextEncoder();
  const used: string[] = [];
  let inTok = 0, outTok = 0, cacheTok = 0;

  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        for (let round = 0; round < 8; round++) {
          const stream = await client().messages.create({
            model: env.aiModel(),
            max_tokens: 8000,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            tools: TOOLS,
            messages,
            stream: true,
            ...(thinking ? { thinking } : {}),
            ...(outputConfig ? { output_config: outputConfig } : {}),
            // The SDK's types do not yet carry adaptive thinking.
          } as unknown as Anthropic.MessageCreateParamsStreaming);

          // Rebuild the assistant turn as the events arrive: text, thinking (with
          // its signature, which must be sent back untouched), and tool calls whose
          // arguments come in as a string of JSON fragments.
          const blocks: Anthropic.ContentBlockParam[] = [];
          let partial = '';

          for await (const ev of stream) {
            if (ev.type === 'content_block_start') {
              const b = ev.content_block;
              partial = '';
              if (b.type === 'text') blocks.push({ type: 'text', text: '' });
              else if (b.type === 'thinking') blocks.push({ type: 'thinking', thinking: '', signature: '' });
              else if (b.type === 'tool_use') blocks.push({ type: 'tool_use', id: b.id, name: b.name, input: {} });
            } else if (ev.type === 'content_block_delta') {
              const last = blocks[blocks.length - 1];
              const d = ev.delta;
              if (d.type === 'text_delta' && last?.type === 'text') {
                last.text += d.text;
                send({ t: 'delta', text: d.text });
              } else if (d.type === 'thinking_delta' && last?.type === 'thinking') {
                last.thinking += d.thinking;
              } else if (d.type === 'signature_delta' && last?.type === 'thinking') {
                last.signature = d.signature;
              } else if (d.type === 'input_json_delta') {
                partial += d.partial_json;
              }
            } else if (ev.type === 'content_block_stop') {
              const last = blocks[blocks.length - 1];
              if (last?.type === 'tool_use' && partial) {
                try { last.input = JSON.parse(partial); } catch { last.input = {}; }
              }
              partial = '';
            } else if (ev.type === 'message_start') {
              inTok += ev.message.usage.input_tokens ?? 0;
              cacheTok += ev.message.usage.cache_read_input_tokens ?? 0;
            } else if (ev.type === 'message_delta') {
              outTok += ev.usage.output_tokens ?? 0;
            }
          }

          const calls = blocks.filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use');
          if (!calls.length) {
            await onFinish?.({ input_tokens: inTok, output_tokens: outTok, cache_read: cacheTok });
            send({ t: 'done', used, usage: { input_tokens: inTok, output_tokens: outTok, cache_read: cacheTok } });
            ctrl.close();
            return;
          }

          messages.push({ role: 'assistant', content: blocks });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const call of calls) {
            used.push(call.name);
            send({ t: 'step', name: call.name });
            let out: unknown;
            try {
              out = await runTool(call.name, call.input as Record<string, unknown>);
            } catch (e) {
              out = { error: String(e) };
            }
            for (const tbl of tablesFrom(call.name, out)) send({ t: 'rows', ...tbl });
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: JSON.stringify(out).slice(0, 60_000),
            });
          }
          messages.push({ role: 'user', content: results });
        }

        send({ t: 'error', message: 'မေးခွန်းက ရှုပ်ထွေးလွန်းပါတယ် — ပိုတိကျအောင် ပြန်မေးကြည့်ပါ။' });
        ctrl.close();
      } catch (e) {
        send({ t: 'error', message: String(e) });
        ctrl.close();
      }
    },
  });
}
