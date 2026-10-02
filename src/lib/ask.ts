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
