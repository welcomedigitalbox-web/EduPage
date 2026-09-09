'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface FbPage { id: string; name: string; token: string; canMessage: boolean }

export interface PageConnectLabels {
  title: string; sub: string; connected: string; notConnected: string;
  connect: string; reconnect: string; disconnect: string; pick: string;
  loading: string; noPages: string; cannotMessage: string; connectedBy: string;
  failed: string; sdkMissing: string;
}

// Everything the dashboard does with a Page: read which Pages the admin has,
// receive that Page's messages, reply to them, and read its own metrics.
const SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
].join(',');

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (
        cb: (r: { authResponse?: { accessToken?: string } }) => void,
        o: { scope: string }
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/**
 * Connecting the Page is a two-step conversation with Facebook: sign in, then
 * choose from the Pages you manage. Doing it here rather than by pasting a
 * token into a deploy means the shop can reconnect a Page themselves.
 */
export function PageConnect({ appId, current, labels }: {
  appId: string | null;
  current: { id: string | null; name: string | null; at: string | null; by: string | null };
  labels: PageConnectLabels;
}) {
  const router = useRouter();
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!appId || window.FB) { setReady(!!window.FB); return; }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
      setReady(true);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    document.body.appendChild(s);
  }, [appId]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/page-connect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? String(res.status));
    return j;
  }

  function login() {
    setErr(null);
    if (!window.FB) { setErr(labels.sdkMissing); return; }
    window.FB.login(async (r) => {
      const token = r.authResponse?.accessToken;
      if (!token) return;
      setBusy(true);
      try {
        const j = await post({ action: 'list', userToken: token });
        setPages(j.pages as FbPage[]);
      } catch (e) {
        setErr(`${labels.failed}: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    }, { scope: SCOPES });
  }

  async function choose(p: FbPage) {
    setBusy(true); setErr(null);
    try {
      await post({ action: 'save', pageId: p.id, pageName: p.name, pageToken: p.token });
      setPages(null);
      router.refresh();
    } catch (e) {
      setErr(`${labels.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge p-3">
        {current.id ? (
          <>
            <span className="h-2 w-2 rounded-full bg-good" />
            <span className="text-sm font-medium">{current.name ?? current.id}</span>
            <span className="text-[11px] text-muted">{labels.connected}</span>
            {current.by && (
              <span className="text-[11px] text-muted">
                · {labels.connectedBy} {current.by}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-bad" />
            <span className="text-sm">{labels.notConnected}</span>
          </>
        )}
      </div>

      {pages && (
        <div className="divide-y divide-edge rounded-lg border border-edge">
          <div className="p-2 text-[11px] text-muted">{labels.pick}</div>
          {pages.length === 0 && <div className="p-3 text-sm text-muted">{labels.noPages}</div>}
          {pages.map((p) => (
            <button key={p.id} disabled={busy || !p.canMessage}
              onClick={() => choose(p)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-edge/40 disabled:opacity-50">
              <span>
                {p.name}
                <span className="ml-2 text-[11px] text-muted">{p.id}</span>
              </span>
              {!p.canMessage && (
                <span className="text-[11px] text-muted">{labels.cannotMessage}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-sm" disabled={busy || !appId || !ready}
          onClick={login}>
          {busy ? labels.loading : current.id ? labels.reconnect : labels.connect}
        </button>
        {current.id && (
          <button className="btn text-sm" disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await post({ action: 'disconnect' }); router.refresh(); }
              finally { setBusy(false); }
            }}>
            {labels.disconnect}
          </button>
        )}
      </div>

      {!appId && <p className="text-xs text-bad">NEXT_PUBLIC_FB_APP_ID</p>}
      {err && <p className="text-xs text-bad">{err}</p>}
    </div>
  );
}
