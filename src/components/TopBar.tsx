'use client';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/i18n';
import { APP_URL } from '@/lib/apps';

export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  async function set(next: Lang) {
    if (next === lang) return;
    await fetch('/api/lang', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: next }),
    });
    router.refresh();
  }
  return (
    <div className="flex overflow-hidden rounded-lg border border-edge text-xs">
      {(['my', 'en'] as Lang[]).map((l) => (
        <button key={l} onClick={() => set(l)}
          className={`px-2 py-1 ${l === lang ? 'bg-brand text-white' : 'text-muted hover:text-white'}`}>
          {l === 'my' ? 'မြန်မာ' : 'EN'}
        </button>
      ))}
    </div>
  );
}

export function SignOut({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-edge hover:text-white"
      onClick={async () => {
        // Signing out clears the shared cookie too, so this ends the session
        // on the POS and the other apps as well. The route says where to land.
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        const { redirect } = (await res.json().catch(() => ({}))) as { redirect?: string };
        window.location.replace(redirect ?? APP_URL.pos);
      }}>
      {label}
    </button>
  );
}
