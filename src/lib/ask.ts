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

export async function ask(history: AskTurn[], language: string): Promise<AskResult> {
  const today = localDay(new Date());
  const system = `You are the analyst for Edu Baby House's Messenger dashboard. You answer the shop's questions about their own data.

TODAY IS ${today}. The shop is in Myanmar (Asia/Yangon). Dates you pass to tools are YYYY-MM-DD and inclusive.

HOW TO ANSWER:
- Call the tools to get real figures. Never estimate, never carry a number over from memory.
- If a question needs data no tool provides, say plainly what you cannot see. Do not guess.
- Revenue is in MMK; ad spend is in USD, billed by Meta. Say which is which. ROAS already converts revenue to USD at that day's rate, so it is comparable.
- Answer in ${language === 'en' ? 'English' : 'Burmese'}, in 2-5 sentences. Lead with the number the person asked for.
- Add one short line of interpretation only when it is genuinely useful — a comparison, a rate, or something that looks wrong.
- Zero is an answer. If the shop has no sales recorded, say so and say why it is likely (orders are only counted once staff complete them in the POS).`;

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
