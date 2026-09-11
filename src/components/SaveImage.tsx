'use client';
import { useState } from 'react';

/**
 * Turns a piece of the page into a JPG the staff can send on. It renders
 * through the browser's own layout engine (SVG foreignObject), which is what
 * makes Burmese come out shaped correctly — canvas-drawing libraries that
 * re-implement text layout mangle it.
 */
export function SaveImage({ targetId, filename, labels }: {
  targetId: string;
  filename: string;
  labels: { save: string; saving: string; failed: string };
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function save() {
    const node = document.getElementById(targetId);
    if (!node) return;
    setBusy(true); setErr(false);
    try {
      const { toJpeg } = await import('html-to-image');
      const url = await toJpeg(node, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.jpg`;
      a.click();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn text-xs print:hidden" disabled={busy} onClick={save}>
      {busy ? labels.saving : err ? labels.failed : labels.save}
    </button>
  );
}
