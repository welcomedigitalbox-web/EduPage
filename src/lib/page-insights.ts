import { env } from './env';

const graph = (path: string) => `https://graph.facebook.com/${env.fbApiVersion()}/${path}`;

/**
 * Page Insights needs a PAGE token, and the one in FB_PAGE_ACCESS_TOKEN was
 * issued with messaging scopes only. The System User token used for ads has
 * the Page assigned with read_insights, so we exchange it for a page token
 * here rather than asking for yet another env var.
 */
let cachedPageToken: { value: string; until: number } | null = null;

async function pageToken(): Promise<string> {
  if (cachedPageToken && cachedPageToken.until > Date.now()) return cachedPageToken.value;
  const sys = env.metaAdsToken();
  const pageId = env.fbPageId();
  const res = await fetch(`${graph(pageId)}?fields=access_token&access_token=${sys}`);
  const json = await res.json() as { access_token?: string; error?: { message?: string } };
  if (!json.access_token) {
    throw new Error(`could not derive a page token: ${json.error?.message ?? 'no access_token returned'}`);
  }
  cachedPageToken = { value: json.access_token, until: Date.now() + 30 * 60_000 };
  return json.access_token;
}

/** Meta retires insight metrics without much warning. Ask for each one on its
 *  own so a single dead metric cannot blank the whole report. */
async function metricSeries(
  metric: string, since: string, until: string, token: string
): Promise<Record<string, number>> {
  const params = new URLSearchParams({
    metric, period: 'day', since, until, access_token: token,
  });
  const res = await fetch(`${graph(`${env.fbPageId()}/insights`)}?${params}`);
  const json = await res.json() as {
    data?: { name: string; values: { value: unknown; end_time: string }[] }[];
  };
  const out: Record<string, number> = {};
  for (const row of json.data ?? []) {
    for (const v of row.values ?? []) {
      // A day's value is a number for most metrics and a breakdown object for
      // a few (reactions by type, say) — sum those rather than dropping them.
      const n = typeof v.value === 'number'
        ? v.value
        : v.value && typeof v.value === 'object'
        ? Object.values(v.value as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0)
        : 0;
      out[v.end_time.slice(0, 10)] = (out[v.end_time.slice(0, 10)] ?? 0) + n;
    }
  }
  return out;
}

/**
 * Meta drops metrics between API versions and answers a request for a dead one
 * with an empty list rather than an error, which reads as "zero" downstream.
 * This reports what a given metric actually returns so the right name can be
 * picked instead of guessed.
 */
export async function probeMetrics(
  metrics: string[], since: string, until: string
): Promise<Record<string, unknown>> {
  const token = await pageToken();
  const out: Record<string, unknown> = {};
  for (const m of metrics) {
    const params = new URLSearchParams({
      metric: m, period: 'day', since, until, access_token: token,
    });
    try {
      const res = await fetch(`${graph(`${env.fbPageId()}/insights`)}?${params}`);
      const json = await res.json() as {
        data?: { name: string; values?: unknown[] }[]; error?: { message?: string; code?: number };
      };
      out[m] = json.error
        ? { error: json.error.message }
        : { returned: (json.data ?? []).map((d) => d.name),
            points: (json.data?.[0]?.values ?? []).length,
            sample: (json.data?.[0]?.values ?? []).slice(-2) };
    } catch (e) {
      out[m] = { error: String(e) };
    }
  }
  return out;
}

/** Same, for one post. Asked one metric at a time: Meta rejects the whole
 *  request if any single name in the list is retired. */
export async function probePostMetrics(postId: string, metrics: string[]) {
  const token = await pageToken();
  const out: Record<string, unknown> = {};
  for (const m of metrics) {
    const params = new URLSearchParams({ metric: m, access_token: token });
    const res = await fetch(`${graph(`${postId}/insights`)}?${params}`);
    const j = await res.json() as {
      data?: { name: string; values?: { value: unknown }[] }[]; error?: { message?: string };
    };
    out[m] = j.error ? { error: j.error.message } : { value: j.data?.[0]?.values?.[0]?.value ?? null };
  }
  return out;
}

export interface PageDay {
  date: string;
  impressions: number;
  reach: number;
  engagements: number;
  video_views: number;
  new_follows: number;
}

export async function fetchPageDaily(since: string, until: string): Promise<{
  days: PageDay[]; followers: number | null; fans: number | null; warnings: string[];
}> {
  const token = await pageToken();
  const warnings: string[] = [];

  const wanted: [keyof Omit<PageDay, 'date'>, string][] = [
    ['impressions', 'page_impressions'],
    ['reach', 'page_impressions_unique'],
    ['engagements', 'page_post_engagements'],
    ['video_views', 'page_video_views'],
    ['new_follows', 'page_daily_follows'],
  ];

  const series: Partial<Record<keyof PageDay, Record<string, number>>> = {};
  for (const [key, metric] of wanted) {
    try {
      series[key] = await metricSeries(metric, since, until, token);
    } catch (e) {
      warnings.push(`${metric}: ${String(e)}`);
      series[key] = {};
    }
  }

  const dates = new Set<string>();
  for (const s of Object.values(series)) for (const d of Object.keys(s ?? {})) dates.add(d);

  const days: PageDay[] = [...dates].sort().map((date) => ({
    date,
    impressions: series.impressions?.[date] ?? 0,
    reach: series.reach?.[date] ?? 0,
    engagements: series.engagements?.[date] ?? 0,
    video_views: series.video_views?.[date] ?? 0,
    new_follows: series.new_follows?.[date] ?? 0,
  }));

  let followers: number | null = null;
  let fans: number | null = null;
  try {
    const r = await fetch(
      `${graph(env.fbPageId())}?fields=followers_count,fan_count&access_token=${token}`
    );
    const j = await r.json() as { followers_count?: number; fan_count?: number };
    followers = j.followers_count ?? null;
    fans = j.fan_count ?? null;
  } catch (e) {
    warnings.push(`followers: ${String(e)}`);
  }

  return { days, followers, fans, warnings };
}

export interface PostRow {
  post_id: string;
  created_time: string;
  message: string | null;
  permalink: string | null;
  media_type: string | null;
  impressions: number;
  reach: number;
  reactions: number;
  comments: number;
  shares: number;
  video_views: number;
  clicks: number;
}

/** Recent posts with their engagement. Counts come from the post edge itself;
 *  reach and impressions need a second call per post. */
export async function fetchPosts(limit = 25): Promise<PostRow[]> {
  const token = await pageToken();
  const params = new URLSearchParams({
    fields: [
      'id', 'created_time', 'message', 'permalink_url', 'status_type',
      'shares', 'comments.summary(true).limit(0)', 'reactions.summary(true).limit(0)',
    ].join(','),
    limit: String(limit),
    access_token: token,
  });
  const res = await fetch(`${graph(`${env.fbPageId()}/posts`)}?${params}`);
  const json = await res.json() as {
    data?: {
      id: string; created_time: string; message?: string; permalink_url?: string;
      status_type?: string; shares?: { count?: number };
      comments?: { summary?: { total_count?: number } };
      reactions?: { summary?: { total_count?: number } };
    }[];
    error?: { message?: string };
  };
  if (json.error) throw new Error(`posts failed: ${json.error.message}`);

  const posts: PostRow[] = [];
  for (const p of json.data ?? []) {
    const row: PostRow = {
      post_id: p.id,
      created_time: p.created_time,
      message: p.message ?? null,
      permalink: p.permalink_url ?? null,
      media_type: p.status_type ?? null,
      impressions: 0,
      reach: 0,
      reactions: p.reactions?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
      video_views: 0,
      clicks: 0,
    };
    try {
      const ip = new URLSearchParams({
        metric: 'post_impressions,post_impressions_unique,post_clicks,post_video_views',
        access_token: token,
      });
      const r = await fetch(`${graph(`${p.id}/insights`)}?${ip}`);
      const j = await r.json() as { data?: { name: string; values: { value: number }[] }[] };
      for (const m of j.data ?? []) {
        const v = Number(m.values?.[0]?.value ?? 0);
        if (m.name === 'post_impressions') row.impressions = v;
        if (m.name === 'post_impressions_unique') row.reach = v;
        if (m.name === 'post_clicks') row.clicks = v;
        if (m.name === 'post_video_views') row.video_views = v;
      }
    } catch {
      // A post with no insights (too new, or a type Meta does not measure)
      // still belongs in the table with its comment and reaction counts.
    }
    posts.push(row);
  }
  return posts;
}
