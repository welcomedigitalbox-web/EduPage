import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let _admin: SupabaseClient | null = null;

/** Server-only client. Uses the service role key, so it bypasses RLS.
 *  Never import this from a client component. */
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
