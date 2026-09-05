import { admin } from '@/lib/supabase';
import { ctx } from '@/lib/server-ctx';
import { Stat, BarChart, num } from '@/components/ui';

export const dynamic = 'force-dynamic';

interface DayRow {
  date: string; impressions: number; reach: number; engagements: number;
  video_views: number; new_follows: number;
  followers_total: number | null; fans_total: number | null;
}
interface PostRow {
  post_id: string; created_time: string; message: string | null; permalink: string | null;
  media_type: string | null; impressions: number; reach: number; reactions: number;
  comments: number; shares: number; video_views: number; clicks: number;
}

export default async function Insights({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const { t, lang } = await ctx();
  const days = Number((await searchParams).days ?? 30);
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const db = admin();
  const [dayRes, postRes] = await Promise.all([
    db.from('msgr_page_daily').select('*').gte('date', from).order('date'),
    db.from('msgr_page_posts').select('*').gte('created_time', from)
      .order('created_time', { ascending: false }).limit(100),
  ]);
  const rows = (dayRes.data ?? []) as DayRow[];
  const posts = (postRes.data ?? []) as PostRow[];

  const sum = (k: keyof DayRow) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const followers = [...rows].reverse().find((r) => r.followers_total != null)?.followers_total ?? null;

  const engagement = posts.reduce(
    (a, p) => ({
      reactions: a.reactions + Number(p.reactions),
      comments: a.comments + Number(p.comments),
      shares: a.shares + Number(p.shares),
      views: a.views + Number(p.video_views),
    }),
    { reactions: 0, comments: 0, shares: 0, views: 0 }
  );

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM',
      { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('pi_title')}</h1>
          <p className="text-sm text-muted">{t('ov_last_days', { n: days })}</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <a key={d} href={`/insights?days=${d}`}
              className={`btn ${d === days ? 'border-brand text-brand' : ''}`}>
              {t('ov_days', { n: d })}
            </a>
          ))}
        </div>
      </header>

      {!rows.length && !posts.length && (
        <div className="card border-warn/50 p-4 text-sm">{t('pi_empty')}</div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('pi_followers')} value={followers != null ? num(followers) : '—'}
              sub={t('pi_new_follows', { n: num(sum('new_follows')) })} />
        <Stat label={t('pi_reach')} value={num(sum('reach'))} sub={t('pi_reach_sub')} />
        <Stat label={t('pi_impressions')} value={num(sum('impressions'))} sub={t('pi_impressions_sub')} />
        <Stat label={t('pi_video_views')} value={num(sum('video_views'))} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('pi_posts')} value={num(posts.length)} sub={t('ov_last_days', { n: days })} />
        <Stat label={t('pi_reactions')} value={num(engagement.reactions)} />
        <Stat label={t('pi_comments')} value={num(engagement.comments)} />
        <Stat label={t('pi_shares')} value={num(engagement.shares)} />
      </section>

      {rows.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="label mb-3">{t('pi_chart_reach')}</div>
            <BarChart data={rows.map((r) => ({ label: r.date.slice(5), value: Number(r.reach) }))}
                      color="var(--series-1)" />
          </div>
          <div className="card p-4">
            <div className="label mb-3">{t('pi_chart_follows')}</div>
            <BarChart data={rows.map((r) => ({ label: r.date.slice(5), value: Number(r.new_follows) }))}
                      color="var(--series-3)" />
          </div>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="label p-3">{t('pi_post_table')}</div>
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('pi_post')}</th>
              <th className="p-3 text-left font-normal">{t('pi_date')}</th>
              <th className="p-3 text-right font-normal">{t('pi_reach')}</th>
              <th className="p-3 text-right font-normal">{t('pi_impressions')}</th>
              <th className="p-3 text-right font-normal">{t('pi_reactions')}</th>
              <th className="p-3 text-right font-normal">{t('pi_comments')}</th>
              <th className="p-3 text-right font-normal">{t('pi_shares')}</th>
              <th className="p-3 text-right font-normal">{t('pi_views')}</th>
              <th className="p-3 text-right font-normal">{t('pi_eng_rate')}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {posts.map((p) => {
              const eng = Number(p.reactions) + Number(p.comments) + Number(p.shares);
              const rate = Number(p.reach) > 0 ? (eng / Number(p.reach)) * 100 : null;
              return (
                <tr key={p.post_id} className="border-b border-edge/50 last:border-0">
                  <td className="max-w-[22rem] p-3">
                    {p.permalink ? (
                      <a href={p.permalink} target="_blank" rel="noreferrer"
                         className="line-clamp-2 hover:text-brand">
                        {p.message?.slice(0, 120) || t('pi_no_text')}
                      </a>
                    ) : (
                      <span className="line-clamp-2">{p.message?.slice(0, 120) || t('pi_no_text')}</span>
                    )}
                    {p.media_type && (
                      <span className="mt-1 inline-block rounded bg-edge px-1.5 py-0.5 text-[10px] text-muted">
                        {p.media_type}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted">{fmtDate(p.created_time)}</td>
                  <td className="p-3 text-right">{num(Number(p.reach))}</td>
                  <td className="p-3 text-right text-muted">{num(Number(p.impressions))}</td>
                  <td className="p-3 text-right">{num(Number(p.reactions))}</td>
                  <td className="p-3 text-right">{num(Number(p.comments))}</td>
                  <td className="p-3 text-right">{num(Number(p.shares))}</td>
                  <td className="p-3 text-right text-muted">{num(Number(p.video_views))}</td>
                  <td className="p-3 text-right">{rate != null ? `${rate.toFixed(1)}%` : '—'}</td>
                </tr>
              );
            })}
            {!posts.length && (
              <tr><td colSpan={9} className="p-6 text-center text-muted">{t('pi_no_posts')}</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
