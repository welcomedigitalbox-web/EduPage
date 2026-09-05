import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'msgr-media';
const MAX_BYTES = 20 * 1024 * 1024; // Meta rejects attachments above ~25MB

/**
 * Store a file staff picked or pasted, and hand back a public URL. Meta's Send
 * API fetches the file from that URL, so it cannot be a signed or private link.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
  const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const db = admin();
  const { error } = await db.storage.from(BUCKET).upload(key, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data } = db.storage.from(BUCKET).getPublicUrl(key);

  const type =
    file.type.startsWith('image/') ? 'image'
    : file.type.startsWith('video/') ? 'video'
    : file.type.startsWith('audio/') ? 'audio'
    : 'file';

  return NextResponse.json({ ok: true, url: data.publicUrl, type, name: file.name });
}
