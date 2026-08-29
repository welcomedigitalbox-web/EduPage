import { overview, dailyFunnel, stageCounts } from '@/lib/queries';
import { Stat, BarChart, Funnel, money, num } from '@/components/ui';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Overview({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = Number(sp.days ?? 30);

  const [o, daily, stages] = await Promise.all([
    overview(days), dailyFunnel(days), stageCounts(days),
  ]);

  const short = (d: string) => d.slice(5);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">ခြုံငုံအခြေအနေ</h1>
          <p className="text-sm text-muted">နောက်ဆုံး {days} ရက်</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/?days=${d}`}
              className={`btn ${d === days ? 'border-brand text-brand' : ''}`}>{d}ရက်</Link>
          ))}
        </div>
      </header>

      {/* --- ဘယ်နှယောက် လာလဲ / ဘယ်နှယောက် ဖြစ်သွားလဲ --- */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="လာဆက်သွယ်သူ (lead)" value={num(o.leads)} sub="Messenger စာ ပထမဆုံးပို့သူ" />
        <Stat label="စကားအဆင်ပြေသွားသူ" value={num(o.engaged)} sub="၂ ကြိမ်အထက် စာပြန်ပြောသွား" />
        <Stat label="စကားမဖြစ်သွားသူ" value={num(o.noConvo)} tone="warn"
              sub="၁ ကြိမ်ပဲ စာပို့ပြီး ငြိမ်သွား" />
        <Stat label="ရောင်းရသူ" value={num(o.orders)} tone="good"
              sub={o.convRate != null ? `conversion ${o.convRate.toFixed(1)}%` : undefined} />
      </section>

      {/* --- ads ငွေ ဘယ်လောက်ကုန်ပြီး ဘယ်လောက်ပြန်ရလဲ --- */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ads ကုန်ကျငွေ" value={money(o.spend)} />
        <Stat label="Lead တစ်ယောက်ကုန်ကျ" value={money(o.costPerLead)} />
        <Stat label="အရောင်းတစ်ခုကုန်ကျ" value={money(o.costPerOrder)}
              tone={o.costPerOrder && o.revenue / Math.max(o.orders, 1) < o.costPerOrder ? 'bad' : undefined} />
        <Stat label="ROAS" value={o.roas != null ? `${o.roas.toFixed(2)}x` : '—'}
              tone={o.roas == null ? undefined : o.roas >= 2 ? 'good' : o.roas >= 1 ? 'warn' : 'bad'}
              sub={`ဝင်ငွေ ${money(o.revenue)}`} />
      </section>

      {/* --- bot vs လူ --- */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bot က ပြန်ဖြေထားတဲ့ chat" value={num(o.botHandled)} />
        <Stat label="လူ လိုက်စစ်ရမယ့် chat" value={num(o.needsHuman)} tone={o.needsHuman ? 'warn' : 'good'} />
        <Stat label="Follow-up စာရင်း" value={num(o.pendingTasks)} tone={o.pendingTasks ? 'warn' : 'good'} />
        <Stat label="Bot အလိုအလျောက်ဖြေနိုင်မှု"
              value={o.autoRate != null ? `${o.autoRate.toFixed(0)}%` : '—'}
              sub={`${num(o.aiReplies)} ဖြေ / ${num(o.aiHandoffs)} လူ့ဆီလွှဲ`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="label mb-3">နေ့စဉ် လာဆက်သွယ်သူ အရေအတွက်</div>
          <BarChart data={daily.map((d) => ({ label: short(d.day), value: d.new_contacts }))}
                    color="var(--series-1)" />
        </div>
        <div className="card p-4">
          <div className="label mb-3">နေ့စဉ် Ads ကုန်ကျငွေ ({'MMK'})</div>
          <BarChart data={daily.map((d) => ({ label: short(d.day), value: Number(d.spend) }))}
                    color="var(--series-2)" format={(n) => Math.round(n).toLocaleString()} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="label mb-3">Lead funnel ({days} ရက်)</div>
          <Funnel steps={[
            { label: 'အသစ်', value: stages.new ?? 0 },
            { label: 'စကားပြော', value: stages.engaged ?? 0 },
            { label: 'စိတ်ဝင်စား', value: stages.qualified ?? 0 },
            { label: 'ညှိနှိုင်း', value: stages.negotiating ?? 0 },
            { label: 'မှာပြီး', value: stages.ordered ?? 0 },
            { label: 'ရောင်းရ', value: stages.won ?? 0 },
          ]} />
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span>မဝယ်တော့: {stages.lost ?? 0}</span>
            <span>ပျောက်သွား: {stages.ghosted ?? 0}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="label mb-3">နေ့စဉ် အရောင်း အရေအတွက်</div>
          <BarChart data={daily.map((d) => ({ label: short(d.day), value: Number(d.orders) }))}
                    color="var(--series-3)" />
          <table className="mt-4 w-full text-xs">
            <thead className="text-muted">
              <tr><th className="text-left font-normal">ရက်</th><th className="text-right font-normal">Lead</th>
              <th className="text-right font-normal">အရောင်း</th><th className="text-right font-normal">ကုန်ကျ</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {daily.slice(-7).reverse().map((d) => (
                <tr key={d.day} className="border-t border-edge">
                  <td className="py-1">{d.day}</td>
                  <td className="text-right">{d.new_contacts}</td>
                  <td className="text-right">{d.orders}</td>
                  <td className="text-right">{Math.round(Number(d.spend)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
