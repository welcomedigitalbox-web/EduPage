'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Red count on the Inbox link. Polls rather than holding a socket open: the
 * dashboard is a handful of staff, and a 20-second poll is far cheaper to run
 * and to reason about than a realtime subscription.
 */
export function InboxBadge() {
  const [n, setN] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    let previous: number | null = null;

    async function tick() {
      try {
        const r = await fetch('/api/unread', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json() as { unanswered: number };
        if (!alive) return;
        setN(j.unanswered);
        // A new arrival while the inbox is open should show up without a
        // manual refresh.
        if (previous != null && j.unanswered > previous) router.refresh();
        previous = j.unanswered;
      } catch {
        // Offline or a redeploy in progress — try again on the next tick.
      }
    }

    tick();
    const id = setInterval(tick, 20_000);
    // Checking again the moment the tab regains focus beats waiting out the timer.
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [router]);

  if (!n) return null;
  return (
    <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-bad px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}
