import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { askStream, type AskTurn } from '@/lib/ask';
import { verifySession, SESSION_COOKIE, LANG_COOKIE, normaliseLang } from '@/lib/session';

export const runtime = 'nodejs';
// A question that needs several tools and a long written answer takes minutes,
// not seconds. The browser sees the words as they are written, so the wait is
// only ever a wait for the whole document.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const c = await cookies();
  const session = await verifySession(c.get(SESSION_COOKIE)?.value);
  // The assistant can read every figure in the business, so it is for managers.
  if (session?.role !== 'manager') {
    return NextResponse.json({ error: 'manager only' }, { status: 403 });
  }

  const { history } = (await req.json()) as { history?: AskTurn[] };
  if (!history?.length) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const lang = normaliseLang(c.get(LANG_COOKIE)?.value);

  // Logged like any other model call so the AI usage page stays honest. The
  // write happens as the stream closes, which is the only point the real token
  // counts are known.
  const stream = askStream(history.slice(-12), lang, async (usage) => {
    try {
      await admin().from('msgr_ai_runs').insert({
        model: process.env.AI_MODEL ?? 'claude-sonnet-4-5',
        intent: 'dashboard_question',
        action: 'replied',
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read,
      });
    } catch {
      // Accounting must never cost the owner their answer.
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
