import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { clearPageCache } from '@/lib/page-creds';

export const runtime = 'nodejs';

const graph = (p: string) => `https://graph.facebook.com/${env.fbApiVersion()}/${p}`;

/** Fields the app needs delivered to its webhook. Asking for more than these
 *  would mean receiving data we never use. */
const WEBHOOK_FIELDS = ['messages', 'messaging_postbacks', 'message_echoes'];

/**
 * Two steps, both here.
 *
 *  list  — take the short-lived user token from Facebook Login, exchange it for
 *          a long-lived one, and return the Pages this person manages so they
 *          can pick the right one.
 *  save  — store the chosen Page and its own Page token, then subscribe the app
 *          to that Page's messaging webhook.
 *
 * A Page token obtained from a long-lived user token does not expire, so the
 * shop never has to come back and reconnect.
 */
export async function POST(req: NextRequest) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session?.role !== 'manager') {
    return NextResponse.json({ error: 'manager only' }, { status: 403 });
  }

  const b = await req.json() as {
    action?: 'list' | 'save' | 'disconnect';
    userToken?: string; pageId?: string; pageName?: string; pageToken?: string;
  };

  if (b.action === 'disconnect') {
    await admin().from('msgr_settings').update({
      page_id: null, page_name: null, page_access_token: null,
      page_connected_at: null, page_connected_by: null,
    }).eq('id', 1);
    clearPageCache();
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'list') {
    if (!b.userToken) return NextResponse.json({ error: 'no token' }, { status: 400 });

    const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
    const secret = env.fbAppSecret();
    let token = b.userToken;

    // A short-lived token lasts about an hour; the Page tokens minted from a
    // long-lived one do not expire at all, which is the difference between
    // connecting once and reconnecting every week.
    if (appId && secret) {
      const ex = await fetch(
        `${graph('oauth/access_token')}?grant_type=fb_exchange_token` +
        `&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${b.userToken}`
      ).then((r) => r.json()).catch(() => null) as { access_token?: string } | null;
      if (ex?.access_token) token = ex.access_token;
    }

    const res = await fetch(
      `${graph('me/accounts')}?fields=id,name,access_token,tasks&limit=100&access_token=${token}`
    );
    const j = await res.json() as {
      data?: { id: string; name: string; access_token: string; tasks?: string[] }[];
      error?: { message?: string };
    };
    if (j.error) return NextResponse.json({ error: j.error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      pages: (j.data ?? []).map((p) => ({
        id: p.id, name: p.name, token: p.access_token,
        canMessage: (p.tasks ?? []).includes('MESSAGING') || (p.tasks ?? []).includes('MANAGE'),
      })),
    });
  }

  if (!b.pageId || !b.pageToken) {
    return NextResponse.json({ error: 'pick a page' }, { status: 400 });
  }

  // Subscribing is what actually makes messages arrive, so a failure here is
  // reported rather than swallowed — a "connected" Page with no webhook looks
  // fine and delivers nothing.
  const sub = await fetch(
    `${graph(`${b.pageId}/subscribed_apps`)}?access_token=${b.pageToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscribed_fields: WEBHOOK_FIELDS.join(',') }),
    }
  ).then((r) => r.json()).catch(() => null) as
    { success?: boolean; error?: { message?: string } } | null;

  if (!sub?.success) {
    return NextResponse.json(
      { error: sub?.error?.message ?? 'could not subscribe the page to the webhook' },
      { status: 400 }
    );
  }

  const { error } = await admin().from('msgr_settings').update({
    page_id: b.pageId,
    page_name: b.pageName ?? null,
    page_access_token: b.pageToken,
    page_connected_at: new Date().toISOString(),
    page_connected_by: session.name || session.email,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  clearPageCache();
  return NextResponse.json({ ok: true });
}
