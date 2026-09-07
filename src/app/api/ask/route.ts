import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { ask, type AskTurn } from '@/lib/ask';
import { verifySession, SESSION_COOKIE, LANG_COOKIE, normaliseLang } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  try {
    const r = await ask(history.slice(-12), lang);
    // Logged like any other model call so the AI usage page stays honest.
    await admin().from('msgr_ai_runs').insert({
      model: process.env.AI_MODEL ?? 'claude-sonnet-4-5',
      intent: 'dashboard_question',
      action: 'replied',
      input_tokens: r.usage.input_tokens,
      output_tokens: r.usage.output_tokens,
      cache_read_tokens: r.usage.cache_read,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
