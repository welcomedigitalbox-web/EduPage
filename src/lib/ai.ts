import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import type { BotSettings, LeadStage } from './types';

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicKey() });
  return _client;
}

/** What the bot is allowed to state as fact. Products come live from the POS
 *  tables; policies come from msgr_kb_items. */
export interface KbItem {
  kind: string;
  title: string;
  body: string;
  price?: number | null;
  stock?: number | null;
  sku?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
}

export interface AiTurn { role: 'customer' | 'agent'; text: string }

export interface AiDecision {
  reply: string;
  intent: string;
  stage: LeadStage;
  confidence: number;
  needs_human: boolean;
  handoff_reason: string | null;
  extracted: {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    items?: {
      product_id: string;
      variant_id?: string | null;
      product_name: string;
      qty: number;
      unit_price: number;
    }[];
  };
  follow_up: { needed: boolean; hours: number | null; reason: string | null };
  usage: { input_tokens: number; output_tokens: number; latency_ms: number; model: string };
}

const DECISION_TOOL: Anthropic.Tool = {
  name: 'respond_to_customer',
  description:
    'Produce the reply to send to the customer plus the CRM classification of this conversation.',
  input_schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description:
          'The message to send back. Short (1-3 sentences), same language the customer wrote in. Empty string if needs_human is true and no holding message is appropriate.',
      },
      intent: {
        type: 'string',
        enum: ['greeting', 'price', 'stock', 'delivery', 'payment', 'order',
               'complaint', 'after_sales', 'other_question', 'spam', 'unclear'],
      },
      stage: {
        type: 'string',
        enum: ['new', 'engaged', 'qualified', 'negotiating', 'ordered', 'won', 'lost', 'ghosted'],
        description: 'Best assessment of where this lead now stands.',
      },
      confidence: {
        type: 'number',
        description: '0 to 1. How sure you are the reply is correct and grounded in the knowledge base.',
      },
      needs_human: {
        type: 'boolean',
        description:
          'True when a person must take over: complaint, refund, price negotiation beyond policy, anything not covered by the knowledge base, or an order that needs confirming.',
      },
      handoff_reason: { type: 'string' },
      extracted: {
        type: 'object',
        description: 'Facts the customer stated in their own words. Never guess these.',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          address: { type: 'string' },
          items: {
            type: 'array',
            description:
              'Only fill this when the customer has clearly committed to buying. Copy product_id and variant_id EXACTLY from the id= field in the knowledge base — never invent one.',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string' },
                variant_id: { type: 'string' },
                product_name: { type: 'string' },
                qty: { type: 'number' },
                unit_price: { type: 'number' },
              },
              required: ['product_id', 'product_name', 'qty', 'unit_price'],
            },
          },
        },
      },
      follow_up: {
        type: 'object',
        properties: {
          needed: { type: 'boolean' },
          hours: { type: 'number', description: 'Hours from now to check back if they go silent.' },
          reason: { type: 'string' },
        },
        required: ['needed'],
      },
    },
    required: ['reply', 'intent', 'stage', 'confidence', 'needs_human', 'follow_up'],
  },
};

function kbBlock(kb: KbItem[], quoteStock: boolean): string {
  if (!kb.length) return '(knowledge base is empty — you must hand off any factual question)';
  return kb
    .map((k) => {
      if (k.kind === 'product') {
        const price = k.price != null ? `${k.price.toLocaleString()} MMK` : 'price unknown';
        const stock =
          k.stock == null ? '' :
          k.stock <= 0 ? ' | OUT OF STOCK — do not accept an order for this' :
          quoteStock ? ` | ${k.stock} in stock` : ' | in stock';
        return `- ${k.title} | ${price}${stock} | id=${k.product_id ?? ''}${k.variant_id ? ':' + k.variant_id : ''}`;
      }
      return `### [${k.kind}] ${k.title}\n${k.body}`;
    })
    .join('\n');
}

function systemPrompt(s: BotSettings, kb: KbItem[]): string {
  const lang =
    s.language === 'my'
      ? 'Reply in Burmese (Myanmar). Use everyday spoken Burmese, not formal literary Burmese.'
      : s.language === 'en'
      ? 'Reply in English.'
      : 'Reply in whichever language the customer used. If they mix Burmese and English, mix naturally.';

  return `You are the Messenger assistant for "${s.business_name}", a shop selling through a Facebook Page.

PERSONA: ${s.persona}
LANGUAGE: ${lang}
OFFICE HOURS: ${s.office_hours ?? 'not specified'}

HARD RULES — breaking these costs the shop money:
1. Answer ONLY from the knowledge base below. Never invent a price, a stock level, a delivery time, or a promotion.
2. If the answer is not in the knowledge base, set needs_human = true and keep the reply to a short holding line ("ခဏလေးစောင့်ပေးပါ၊ staff ကနေ ချက်ချင်းပြန်ဖြေပေးပါမယ်ရှင်").
3. Complaints, refunds, damaged goods, or an angry customer → needs_human = true, always.
4. Prices and stock in the knowledge base come live from the shop's POS. Quote them exactly. If an item is marked OUT OF STOCK, say so and offer an alternative from the list — never take an order for it.
4b. When the customer commits to buying, collect name, phone and full address, fill extracted.items with the exact ids from the knowledge base, set stage = "ordered" and needs_human = true. A person confirms every order before it ships.
5. Never promise a discount. Never quote a price that is not in the knowledge base.
6. Keep replies to 1-3 short sentences. This is Messenger, not email. No bullet lists, no headings.
7. Do not use emoji unless the customer used one first.
8. Set confidence honestly. Low confidence is far better than a confident wrong answer.

STAGE GUIDE:
- new: just said hi, no product interest yet
- engaged: asking about a product but no buying signal
- qualified: asked price/stock/delivery with real interest, or gave a phone number
- negotiating: haggling, comparing, asking for a discount
- ordered: agreed to buy, order details being taken
- lost: said no / too expensive / already bought elsewhere

KNOWLEDGE BASE (live from the POS — prices and stock are current as of this second)
${kbBlock(kb, s.quote_stock)}`;
}

export async function decide(opts: {
  settings: BotSettings;
  kb: KbItem[];
  history: AiTurn[];
  customerName?: string | null;
}): Promise<AiDecision> {
  const started = Date.now();
  const model = env.aiModel();

  const messages: Anthropic.MessageParam[] = opts.history.map((t) => ({
    role: t.role === 'customer' ? ('user' as const) : ('assistant' as const),
    content: t.text || '(no text)',
  }));
  // Anthropic requires the conversation to start with a user turn.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) messages.push({ role: 'user', content: '(customer sent an attachment)' });

  const res = await client().messages.create({
    model,
    max_tokens: 1024,
    // The product catalogue + policies are the same on every turn and dwarf
    // the chat itself, so cache them: repeat reads bill at a fraction of the
    // normal input price. The cache lives ~5 minutes — i.e. exactly the span
    // of an active conversation.
    system: [{
      type: 'text',
      text: systemPrompt(opts.settings, opts.kb),
      cache_control: { type: 'ephemeral' },
    }],
    tools: [DECISION_TOOL],
    tool_choice: { type: 'tool', name: 'respond_to_customer' },
    messages,
  });

  const block = res.content.find((c) => c.type === 'tool_use');
  const raw = (block && 'input' in block ? block.input : {}) as Partial<AiDecision>;

  return {
    reply: raw.reply ?? '',
    intent: raw.intent ?? 'unclear',
    stage: (raw.stage as LeadStage) ?? 'engaged',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    needs_human: raw.needs_human ?? true,
    handoff_reason: raw.handoff_reason ?? null,
    extracted: raw.extracted ?? {},
    follow_up: raw.follow_up ?? { needed: false, hours: null, reason: null },
    usage: {
      input_tokens:
        res.usage.input_tokens +
        (res.usage.cache_read_input_tokens ?? 0) +
        (res.usage.cache_creation_input_tokens ?? 0),
      output_tokens: res.usage.output_tokens,
      latency_ms: Date.now() - started,
      model,
    },
  };
}
