// Reading the sign-in shared with the POS.
//
// supabase-js on the POS writes its session to a cookie on
// .edubabyhouse.store rather than to localStorage, which is what lets every
// subdomain see the same login. Sessions outgrow the ~4 KB cookie limit, so
// the value is split across numbered chunks and reassembled here.
//
// This only reads the cookie. Whether the token inside is still valid is
// Supabase's answer to give, not ours -- see adoptSession.

const COOKIE_KEY = 'ebh-auth';
const STORAGE_KEY = 'ebh';

export const SHARED_COOKIE_PREFIX = `${COOKIE_KEY}-${STORAGE_KEY}`;

type CookieReader = { get(name: string): { value: string } | undefined };

function readShared(jar: CookieReader): string | null {
  const head = jar.get(`${SHARED_COOKIE_PREFIX}.0`)?.value;
  if (head === undefined) return jar.get(SHARED_COOKIE_PREFIX)?.value ?? null;

  let value = head;
  for (let i = 1; ; i++) {
    const part = jar.get(`${SHARED_COOKIE_PREFIX}.${i}`)?.value;
    if (part === undefined) break;
    value += part;
  }
  return value;
}

/** True when a POS session is present — not that it is still valid. */
export function hasSharedSession(jar: CookieReader): boolean {
  return readShared(jar) !== null;
}

/** The access token from the shared cookie, or null if there isn't one. */
export function sharedAccessToken(jar: CookieReader): string | null {
  const raw = readShared(jar);
  if (!raw) return null;

  try {
    // supabase-js base64-encodes the session and prefixes it; older versions
    // stored plain JSON, so both shapes are worth handling.
    const text = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7), 'base64').toString('utf8')
      : raw;
    const session = JSON.parse(text) as { access_token?: string };
    return session.access_token ?? null;
  } catch {
    return null;
  }
}
