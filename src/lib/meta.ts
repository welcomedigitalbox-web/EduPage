import crypto from 'crypto';
import { env } from './env';

const graph = (path: string) =>
  `https://graph.facebook.com/${env.fbApiVersion()}/${path}`;

/** Verify the X-Hub-Signature-256 header Meta sends with every webhook POST.
 *  Without this, anyone who learns your URL can inject fake customers. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = env.fbAppSecret();
  if (!secret) return true; // allow local dev without the secret set
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function sendText(psid: string, text: string, tag?: string) {
  const body: Record<string, unknown> = {
    recipient: { id: psid },
    message: { text: text.slice(0, 1900) },
    messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
  };
  if (tag) body.tag = tag;

  const res = await fetch(`${graph('me/messages')}?access_token=${env.fbPageToken()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Send API failed: ${JSON.stringify(json)}`);
  return json as { message_id?: string; recipient_id?: string };
}

/**
 * Send a file the customer can open in Messenger. Meta fetches the URL itself,
 * so it must be publicly reachable — the dashboard puts uploads in a public
 * Supabase bucket for exactly this reason.
 */
export async function sendAttachment(
  psid: string, url: string, type: 'image' | 'video' | 'audio' | 'file' = 'image'
) {
  const body = {
    recipient: { id: psid },
    message: { attachment: { type, payload: { url, is_reusable: false } } },
    messaging_type: 'RESPONSE',
  };
  const res = await fetch(`${graph('me/messages')}?access_token=${env.fbPageToken()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Send attachment failed: ${JSON.stringify(json)}`);
  return json as { message_id?: string };
}

export async function senderAction(psid: string, action: 'typing_on' | 'typing_off' | 'mark_seen') {
  await fetch(`${graph('me/messages')}?access_token=${env.fbPageToken()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, sender_action: action }),
  }).catch(() => {});
}

/**
 * Name and photo for a PSID. Ask for nothing but the three fields Meta still
 * serves: `locale` was retired, and requesting one dead field makes the whole
 * call fail — which is why every contact was left showing its PSID.
 */
export async function fetchProfile(
  psid: string,
  onError?: (detail: unknown) => void
) {
  try {
    const res = await fetch(
      `${graph(psid)}?fields=first_name,last_name,profile_pic&access_token=${env.fbPageToken()}`
    );
    const j = (await res.json()) as {
      first_name?: string; last_name?: string; profile_pic?: string;
      error?: { message?: string; code?: number };
    };
    if (j.error) {
      console.error('[meta] profile failed', psid, j.error.message);
      onError?.({ psid, ...j.error });
      return null;
    }
    const name = [j.first_name, j.last_name].filter(Boolean).join(' ') || null;
    if (!name && !j.profile_pic) {
      onError?.({ psid, note: 'no error, but no name either', got: Object.keys(j) });
      return null;
    }
    return { name, profile_pic: j.profile_pic ?? null };
  } catch (e) {
    console.error('[meta] profile threw', psid, e);
    onError?.({ psid, threw: String(e) });
    return null;
  }
}

// ---------------- Marketing API ----------------

export interface AdInsightRow {
  date_start: string;
  campaign_id?: string; campaign_name?: string;
  adset_id?: string; adset_name?: string;
  ad_id?: string; ad_name?: string;
  spend?: string; impressions?: string; reach?: string; clicks?: string;
  account_currency?: string;
  actions?: { action_type: string; value: string }[];
}

/** Pull per-ad, per-day insights from the Marketing API. */
export async function fetchAdInsights(since: string, until: string): Promise<AdInsightRow[]> {
  const account = env.metaAdAccountId();
  if (!account) return [];
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields: [
      'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
      'ad_id', 'ad_name', 'spend', 'impressions', 'reach', 'clicks',
      'account_currency', 'actions',
    ].join(','),
    limit: '500',
    access_token: env.metaAdsToken(),
  });

  const rows: AdInsightRow[] = [];
  let url = `${graph(`${account}/insights`)}?${params}`;
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) throw new Error(`Insights failed: ${JSON.stringify(json)}`);
    rows.push(...(json.data ?? []));
    url = json.paging?.next ?? '';
  }
  return rows;
}

/** Meta reports "messaging conversations started" inside the actions array. */
export function messagingConversations(row: AdInsightRow): number {
  const hit = row.actions?.find(
    (a) =>
      a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
      a.action_type === 'onsite_conversion.total_messaging_connection'
  );
  return hit ? Number(hit.value) || 0 : 0;
}
