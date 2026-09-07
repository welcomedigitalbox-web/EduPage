'use client';
import { useState, useRef, useEffect } from 'react';

interface Turn { role: 'user' | 'assistant'; content: string; used?: string[] }

export function AskPanel({
  suggestions, labels,
}: {
  suggestions: string[];
  labels: { placeholder: string; send: string; thinking: string; failed: string; hint: string };
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...turns, { role: 'user' as const, content: question }];
    setTurns(next); setText(''); setBusy(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history: next.map(({ role, content }) => ({ role, content })) }),
      });
      const j = await res.json();
      setTurns([...next, {
        role: 'assistant',
        content: res.ok ? j.answer : `${labels.failed}: ${String(j.error).slice(0, 200)}`,
        used: j.used,
      }]);
    } catch (e) {
      setTurns([...next, { role: 'assistant', content: `${labels.failed}: ${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex h-[calc(100vh-9rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!turns.length && (
          <div className="space-y-2">
            <p className="text-sm text-muted">{labels.hint}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} className="btn text-xs" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              t.role === 'user' ? 'bg-brand/20' : 'bg-edge'
            }`}>
              {t.content}
              {t.used?.length ? (
                <div className="mt-1 text-[10px] text-muted">{[...new Set(t.used)].join(' · ')}</div>
              ) : null}
            </div>
          </div>
        ))}

        {busy && <div className="text-sm text-muted">{labels.thinking}</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-edge p-3">
        <div className="flex gap-2">
          <input
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder={labels.placeholder}
            onKeyDown={(e) => { if (e.key === 'Enter') send(text); }}
            className="flex-1 rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand"
          />
          <button className="btn-primary" disabled={busy || !text.trim()}
            onClick={() => send(text)}>{labels.send}</button>
        </div>
      </div>
    </div>
  );
}
