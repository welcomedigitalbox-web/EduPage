import type { Lang } from './i18n';

export type Role = 'agent' | 'manager';

export interface Session {
  uid: string;
  email: string;
  name: string | null;
  role: Role;
  exp: number;
}

/** Pages an agent may not open. Managers see everything. */
export const MANAGER_ONLY = ['/ads', '/settings'];

export function canOpen(role: Role, pathname: string): boolean {
  if (role === 'manager') return true;
  return !MANAGER_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const enc = new TextEncoder();

function secret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.DASHBOARD_PASSWORD ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'insecure-dev-secret'
  );
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

/** Signed, tamper-proof session cookie. Works in both the Node and Edge runtimes,
 *  so the middleware can verify it without a database round-trip on every request. */
export async function signSession(s: Session): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(s)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      'HMAC', await key(), unb64url(sig), enc.encode(payload)
    );
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64url(payload))) as Session;
    if (!s.exp || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'sess';
export const LANG_COOKIE = 'lang';
export const SESSION_DAYS = 14;

export function normaliseLang(v: string | undefined): Lang {
  return v === 'en' ? 'en' : 'my';
}
