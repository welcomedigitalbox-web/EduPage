import { NextRequest, NextResponse } from 'next/server';

/** Minimal shared-password gate for the dashboard.
 *  Webhook and cron routes authenticate on their own and are excluded. */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get('dash')?.value;
  if (cookie === password) return NextResponse.next();

  const supplied = req.nextUrl.searchParams.get('key');
  if (supplied === password) {
    const url = req.nextUrl.clone();
    url.searchParams.delete('key');
    const res = NextResponse.redirect(url);
    res.cookies.set('dash', password, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  return new NextResponse(
    '<body style="font-family:system-ui;background:#0f1115;color:#e7e9ee;display:grid;place-items:center;height:100vh">' +
    '<form><input name="key" type="password" placeholder="password" autofocus ' +
    'style="padding:.6rem;border-radius:.5rem;border:1px solid #262b35;background:#171a21;color:#fff"></form></body>',
    { status: 401, headers: { 'content-type': 'text/html' } }
  );
}

export const config = {
  matcher: ['/((?!api/webhook|api/cron|privacy|_next|favicon.ico).*)'],
};
