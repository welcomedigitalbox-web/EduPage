'use client';
import { useState } from 'react';

/** Staff paste this into Viber. Building the text on the server and handing it
 *  over whole means what gets shared is exactly what is on the screen. */
export function CopyOrder({ text, labels }: {
  text: string; labels: { copy: string; copied: string; print: string };
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be refused; a selectable prompt still gets the job done.
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <>
      <button className="btn print:hidden" onClick={copy}>
        {done ? labels.copied : labels.copy}
      </button>
      <button className="btn print:hidden" onClick={() => window.print()}>
        {labels.print}
      </button>
    </>
  );
}
