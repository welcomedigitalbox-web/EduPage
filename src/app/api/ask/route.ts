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

  const { history, chatId } = (await req.json()) as { history?: AskTurn[]; chatId?: string | null };
  if (!history?.length) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const lang = normaliseLang(c.get(LANG_COOKIE)?.value);
  const db = admin();
  const question = history[history.length - 1]?.content ?? '';

  // The thread is opened before the answer is written, so a question that fails
  // half way still leaves a trace of what was asked.
  let thread = chatId ?? null;
  try {
    if (!thread) {
      const { data } = await db.from('msgr_ask_chats')
        .insert({ title: question.slice(0, 80), email: session.email })
        .select('id').single();
      thread = data?.id ?? null;
    } else {
      await db.from('msgr_ask_chats').update({ updated_at: new Date().toISOString() }).eq('id', thread);
    }
    if (thread) {
      await db.from('msgr_ask_messages')
        .insert({ chat_id: thread, role: 'user', content: question, email: session.email });
    }
  } catch {
    // The history is a convenience; it must never cost the owner their answer.
  }

  const stream = askStream(history.slice(-12), lang, async (usage, answer) => {
    // Logged like any other model call so the AI usage page stays honest, and
    // kept so another manager can find the answer tomorrow.
    try {
      await db.from('msgr_ai_runs').insert({
        model: process.env.AI_MODEL ?? 'claude-sonnet-4-5',
        intent: 'dashboard_question',
        action: 'replied',
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read,
      });
    } catch { /* accounting never blocks the answer */ }
    try {
      if (thread && answer.trim()) {
        await db.from('msgr_ask_messages')
          .insert({ chat_id: thread, role: 'assistant', content: answer, email: session.email });
      }
    } catch { /* same */ }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
      ...(thread ? { 'x-chat-id': thread } : {}),
    },
  });
}
