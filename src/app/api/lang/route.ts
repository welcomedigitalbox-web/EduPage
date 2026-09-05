import { NextRequest, NextResponse } from 'next/server';
import { LANG_COOKIE } from '@/lib/session';

/** Language lives in a cookie so server components can render in it directly. */
export async function POST(req: NextRequest) {
  const { lang } = (await req.json()) as { lang?: string };
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LANG_COOKIE, lang === 'en' ? 'en' : 'my', {
    path: '/', sameSite: 'lax', maxAge: 365 * 86400,
  });
  return res;
}
