'use client';
import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AskAnswer } from './AskAnswer';

interface Table { name: string; rows: Record<string, unknown>[] }
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  used?: string[];
  tables?: Table[];
  email?: string | null;
}
interface Chat { id: string; title: string | null; email: string | null; updated_at: string }

// Everyone sees everyone's threads: a figure looked up once should not be paid
// for twice, and an answer nobody can find again may as well not exist.
const who = (e?: string | null) => (e ? e.split('@')[0] : '');

export function AskPanel({
  suggestions, labels,
}: {
  suggestions: string[];
  labels: { placeholder: string; send: string; thinking: string; failed: string; hint: string };
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [showSide, setShowSide] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);
  useEffect(() => { loadChats(); }, []);

  async function loadChats() {
    try {
      const r = await fetch('/api/ask/history');
      const j = await r.json();
      setChats(j.chats ?? []);
    } catch { /* the list is a convenience */ }
  }

  async function openChat(id: string) {
    setBusy(true); setShowSide(false);
    try {
      const r = await fetch(`/api/ask/history?id=${id}`);
      const j = await r.json();
      setTurns((j.messages ?? []).map((m: Record<string, unknown>) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content ?? ''),
        tables: (m.tables as Table[]) ?? [],
        used: (m.used as string[]) ?? [],
        email: (m.email as string) ?? null,
      })));
      setChatId(id);
    } finally { setBusy(false); }
  }

  async function removeChat(id: string) {
    await fetch(`/api/ask/history?id=${id}`, { method: 'DELETE' });
    if (id === chatId) { setChatId(null); setTurns([]); }
    loadChats();
  }

  function newChat() { setChatId(null); setTurns([]); setShowSide(false); }

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: question }];
    // The assistant's turn exists from the first moment so the answer can be
    // written into it a piece at a time rather than appearing all at once.
    setTurns([...next, { role: 'assistant', content: '', used: [], tables: [] }]);
    setText(''); setBusy(true); setStep('');

    const patch = (fn: (t: Turn) => Turn) =>
      setTurns((cur) => cur.map((t, i) => (i === cur.length - 1 ? fn(t) : t)));

    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chatId,
          history: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const thread = res.headers.get('x-chat-id');
      if (thread && thread !== chatId) setChatId(thread);

      // An error comes back as plain JSON; a good answer as a stream of lines.
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('ndjson')) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        patch((t) => ({ ...t, content: `${labels.failed}: ${String(j.error).slice(0, 300)}` }));
        return;
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.t === 'delta') {
            patch((t) => ({ ...t, content: t.content + String(ev.text) }));
          } else if (ev.t === 'step') {
            setStep(String(ev.name));
            patch((t) => ({ ...t, used: [...(t.used ?? []), String(ev.name)] }));
          } else if (ev.t === 'rows') {
            patch((t) => ({
              ...t,
              tables: [...(t.tables ?? []), { name: String(ev.name), rows: ev.rows as Record<string, unknown>[] }],
            }));
          } else if (ev.t === 'error') {
            patch((t) => ({ ...t, content: t.content || `${labels.failed}: ${String(ev.message)}` }));
          }
        }
      }
    } catch (e) {
      patch((t) => ({ ...t, content: t.content || `${labels.failed}: ${String(e)}` }));
    } finally {
      setBusy(false); setStep('');
      loadChats();
    }
  }

  // Taking the answer away: the words to paste into a message, the figures to
  // open in Excel, the whole thing on paper as a document of its own.
  function copyAnswer(t: Turn) {
    navigator.clipboard?.writeText(t.content);
  }

  function toExcel(t: Turn, i: number) {
    if (!t.tables?.length) return;
    const wb = XLSX.utils.book_new();
    t.tables.forEach((tbl, k) => {
      const ws = XLSX.utils.json_to_sheet(tbl.rows);
      XLSX.utils.book_append_sheet(wb, ws, tbl.name.replace(/[^\w.]/g, '').slice(0, 28) || `Data ${k + 1}`);
    });
    const note = XLSX.utils.aoa_to_sheet([
      ['Question'], [turns[i - 1]?.content || ''],
      [], ['Answer'], ...t.content.split('\n').map((l) => [l]),
    ]);
    XLSX.utils.book_append_sheet(wb, note, 'Answer');
    XLSX.writeFile(wb, `edupage-ask-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // A document, not a screenshot of the app. The rendered answer is lifted out
  // of the page and dropped into a clean A4 sheet with a letterhead, so what
  // comes out of the printer is something that can be handed over.
  function printAnswer(i: number) {
    const node = document.getElementById(`edu-ans-${i}`);
    if (!node) return;
    const question = turns[i - 1]?.content || '';
    const today = new Date().toLocaleDateString('en-GB', {
      timeZone: 'Asia/Yangon', day: '2-digit', month: 'long', year: 'numeric',
    });
    const safe = (s: string) => s.replace(/[<>]/g, '');

    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${safe(question).slice(0, 80) || 'Edu Baby House'}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Pyidaungsu","Myanmar Text","Noto Sans Myanmar",
         -apple-system,"Segoe UI",Arial,sans-serif; font-size: 11.5pt; line-height: 1.7;
         color:#111; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 18px; }
  header .co { font-size: 14pt; font-weight: 700; letter-spacing: .3px; }
  header .meta { font-size: 9pt; color:#555; margin-top: 2px; }
  .q { background:#f4f6f8; border-left:3px solid #94a3b8; padding:8px 12px;
       font-size:10.5pt; color:#334155; margin-bottom:18px; }
  h1 { font-size: 15pt; margin: 0 0 10px; }
  h2 { font-size: 12.5pt; margin: 20px 0 8px; padding-bottom:3px;
       border-bottom:1px solid #e2e8f0; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 16px 0 6px; page-break-after: avoid; }
  p, li { margin: 0 0 7px; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  table { width:100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 10pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background:#eef2f6; font-weight: 600; }
  tr:nth-child(even) td { background:#fafbfc; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 9.5pt; background:#f4f6f8; padding:1px 4px; }
  pre, details, summary, button { display:none !important; }
  blockquote { margin:0 0 10px; padding-left:12px; border-left:3px solid #cbd5e1; color:#475569; }
  footer { margin-top: 24px; border-top:1px solid #cbd5e1; padding-top:6px;
           font-size: 8.5pt; color:#64748b; display:flex; justify-content:space-between; }
  a { color:#111; text-decoration: none; }
</style></head><body>
<header>
  <div class="co">Edu Baby House</div>
  <div class="meta">Online &amp; Page Report · ${today}</div>
</header>
${question ? `<div class="q"><b>မေးခွန်း:</b> ${safe(question)}</div>` : ''}
${node.innerHTML}
<footer><span>Edu Baby House — onlineorder.edubabyhouse.store</span><span>${today}</span></footer>
</body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { document.body.removeChild(frame); return; }
    doc.open(); doc.write(html); doc.close();
    // Give the fonts a moment, then hand it to the printer and clean up after.
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => document.body.removeChild(frame), 1000);
    }, 350);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <button onClick={newChat}
        className="btn mb-3 w-full text-left text-sm">＋ မေးခွန်းအသစ်</button>
      <div className="mb-1 px-1 text-xs text-muted">History</div>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {chats.map((c) => (
          <div key={c.id}
            className={`group flex items-center rounded-lg ${c.id === chatId ? 'bg-edge' : 'hover:bg-edge/50'}`}>
            <button onClick={() => openChat(c.id)} className="flex-1 px-3 py-2 text-left">
              <div className="truncate text-sm">{c.title || 'Untitled'}</div>
              <div className="text-[10px] text-muted">{who(c.email)}</div>
            </button>
            <button onClick={() => removeChat(c.id)}
              className="px-2 text-xs text-muted opacity-0 hover:text-red-400 group-hover:opacity-100">✕</button>
          </div>
        ))}
        {!chats.length && <div className="px-3 py-2 text-xs text-muted">မေးထားတာ မရှိသေးပါ</div>}
      </div>
    </div>
  );

  return (
    <div className="flex gap-4">
      <aside className="card hidden w-60 shrink-0 p-3 md:block lg:h-[calc(100vh-9rem)]">{sidebar}</aside>

      {showSide && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowSide(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute bottom-0 left-0 top-0 w-72 bg-ink p-4"
            onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}

    <div className="card flex h-[70vh] min-w-0 flex-1 flex-col lg:h-[calc(100vh-9rem)]">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2 md:hidden">
        <button onClick={() => setShowSide(true)} className="btn text-sm">☰ History</button>
      </div>
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
            {t.role === 'user' ? (
              <div className="max-w-[80%] rounded-xl bg-brand/20 px-3 py-2 text-sm">
                <div className="whitespace-pre-wrap">{t.content}</div>
                {t.email && <div className="mt-1 text-[10px] text-muted">{who(t.email)}</div>}
              </div>
            ) : (
              <div className="w-full rounded-xl bg-edge/40 px-4 py-3">
                <div id={`edu-ans-${i}`}><AskAnswer text={t.content} /></div>
                {t.content && (
                  <div className="mt-3 flex flex-wrap gap-3 border-t border-edge pt-2 text-xs">
                    <button className="text-muted hover:text-slate-900" onClick={() => copyAnswer(t)}>Copy</button>
                    {t.tables?.length ? (
                      <button className="text-muted hover:text-slate-900" onClick={() => toExcel(t, i)}>Excel</button>
                    ) : null}
                    <button className="text-muted hover:text-slate-900" onClick={() => printAnswer(i)}>PDF / Print</button>
                  </div>
                )}
                {t.used?.length ? (
                  <div className="mt-1 text-[10px] text-muted">{[...new Set(t.used)].join(' · ')}</div>
                ) : null}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="text-sm text-muted">
            {step ? `${labels.thinking} — ${step}` : labels.thinking}
          </div>
        )}
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
    </div>
  );
}
