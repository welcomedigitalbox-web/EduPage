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
  usage: {
    input_tokens: number; output_tokens: number;
    cache_read_tokens: number; cache_write_tokens: number;
    latency_ms: number; model: string;
  };
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
          'The message to send back. At most 2 short sentences — this is Messenger. Same language the customer wrote in. Empty string if needs_human is true and no holding message is appropriate.',
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
      handoff_reason: {
        type: 'string',
        description: 'Only when needs_human is true. A few words, not a sentence.',
      },
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
        description: 'Omit entirely unless the customer should be chased if they go quiet.',
        properties: {
          needed: { type: 'boolean' },
          hours: { type: 'number', description: 'Hours from now to check back if they go silent.' },
          reason: { type: 'string' },
        },
        required: ['needed'],
      },
    },
    required: ['reply', 'intent', 'stage', 'confidence', 'needs_human'],
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
1. The knowledge base below is the ONLY thing you know about this shop. Every
   factual claim in your reply must be traceable to a specific line in it.
   Before you answer, find the line you are relying on. If you cannot point to
   one, you do not know the answer.
1b. Things you must NEVER state unless the knowledge base says them in words:
   prices, stock, product names or features, delivery times or fees for a place
   not listed, payment methods, promotions or discounts, shop addresses or
   opening hours, phone numbers, warranty or return terms. Do not reason your
   way to one of these from something similar — a policy for Yangon says
   nothing about Taunggyi.
2. If the answer is not there, set needs_human = true. Say so WARMLY — this is
   a shop talking to a customer, not a system returning an error. Acknowledge
   what they asked, apologise lightly, and promise a person will follow up.
   Something in the spirit of "ဒီအကြောင်းလေးကတော့ ကျွန်မ သေချာမသိသေးလို့ပါရှင်၊
   staff ကနေ ချက်ချင်း စစ်ပြီး ပြန်ဖြေပေးပါမယ်နော်" — vary the wording naturally,
   keep the shop's persona, and use ရှင်/ပါ/နော် the way a Myanmar shop does.
   What you must NOT do is fill the gap with a guess, a "probably", or a general
   statement about shops. Warm and honest, never cold, never invented.
2b. Greetings, thanks and small talk you may answer normally — those are not
   factual claims. Confidence should be high for those.
3. Complaints, refunds, damaged goods, or an angry customer → needs_human = true, always.
4. Prices and stock in the knowledge base come live from the shop's POS. Quote them exactly. If an item is marked OUT OF STOCK, say so and offer an alternative from the list — never take an order for it.
4b. When the customer commits to buying, collect name, phone and full address, fill extracted.items with the exact ids from the knowledge base, set stage = "ordered" and needs_human = true. A person confirms every order before it ships.
5. Never promise a discount. Never quote a price that is not in the knowledge base.
6. Keep replies to ONE or TWO short sentences. This is Messenger, not email. No bullet lists, no headings, no repeating what the customer just said back to them.
7. Do not use emoji unless the customer used one first.
8. Set confidence honestly. Low confidence is far better than a confident wrong answer.
9. BURMESE WORDING — verbs get mangled easily, so use exactly these:
   - delivering goods = "ပို့ပေးပါတယ်" / "ပို့ဆောင်ပေးပါတယ်". NEVER "သောက်ပေးပါတယ်", never "အပ်ပေးပါတယ်" for shipping.
   - handing over at the door = "လက်ခံရရှိပါမယ်"
   - paying = "ငွေချေပါတယ်" / "ငွေလွှဲပါတယ်"
   Re-read your reply before returning it: every verb must be one a shop would actually say. A wrong verb makes the shop look like a bot.

STAGE GUIDE:
- new: just said hi, no product interest yet
- engaged: asking about a product but no buying signal
- qualified: asked price/stock/delivery with real interest, or gave a phone number
- negotiating: haggling, comparing, asking for a discount
- ordered: agreed to buy, order details being taken
- lost: said no / too expensive / already bought elsewhere

The knowledge base covers these topics and nothing else. A question outside
this list goes to a person:
${kb.map((k) => k.title).slice(0, 80).join(' | ')}

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
    // A Messenger reply plus its classification never needs more than this;
    // the ceiling stops a rambling turn from costing five times a normal one.
    max_tokens: 500,
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
      input_tokens: res.usage.input_tokens,
      cache_read_tokens: res.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: res.usage.cache_creation_input_tokens ?? 0,
      output_tokens: res.usage.output_tokens,
      latency_ms: Date.now() - started,
      model,
    },
  };
}
