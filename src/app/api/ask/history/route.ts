import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

async function manager() {
  const c = await cookies();
  const s = await verifySession(c.get(SESSION_COOKIE)?.value);
  return s?.role === 'manager' ? s : null;
}

// The list every manager sees: all threads, newest first, with who asked.
export async function GET(req: NextRequest) {
  const s = await manager();
  if (!s) return NextResponse.json({ error: 'manager only' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  const db = admin();

  if (id) {
    const { data } = await db.from('msgr_ask_messages')
      .select('role,content,tables,used,email,created_at')
      .eq('chat_id', id).order('created_at');
    return NextResponse.json({ messages: data ?? [] });
  }

  const { data } = await db.from('msgr_ask_chats')
    .select('id,title,email,updated_at')
    .order('updated_at', { ascending: false }).limit(100);
  return NextResponse.json({ chats: data ?? [] });
}

// Deleting is deliberately open to any manager: a shared list nobody may tidy
// fills with half-finished questions.
export async function DELETE(req: NextRequest) {
  const s = await manager();
  if (!s) return NextResponse.json({ error: 'manager only' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'no id' }, { status: 400 });
  await admin().from('msgr_ask_chats').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
