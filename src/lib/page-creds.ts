import { admin } from './supabase';
import { env } from './env';

export interface PageCreds { id: string; token: string; name: string | null }

// Every outbound Meta call needs these, so they are cached briefly rather than
// re-read per message. A reconnect clears the cache immediately.
let cache: { value: PageCreds; until: number } | null = null;

/** The connected Page, preferring what the admin chose in Settings and falling
 *  back to the environment so an existing deployment keeps working untouched. */
export async function pageCreds(): Promise<PageCreds> {
  if (cache && cache.until > Date.now()) return cache.value;

  const { data } = await admin()
    .from('msgr_settings').select('page_id,page_name,page_access_token').eq('id', 1).maybeSingle();

  const value: PageCreds = data?.page_id && data?.page_access_token
    ? { id: data.page_id as string, token: data.page_access_token as string,
        name: (data.page_name as string) ?? null }
    : { id: env.fbPageId(), token: env.fbPageToken(), name: null };

  cache = { value, until: Date.now() + 60_000 };
  return value;
}

export function clearPageCache() { cache = null; }
