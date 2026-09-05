import Link from 'next/link';
import type { LeadStage } from '@/lib/types';

export function Stat({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : '';
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function StageBadge({ stage, label }: { stage: LeadStage; label: string }) {
  const tone: Record<string, string> = {
    new: 'border-edge text-muted',
    engaged: 'border-[#3987e5] text-[#3987e5]',
    qualified: 'border-[#3987e5] text-[#3987e5]',
    negotiating: 'border-warn text-warn',
    ordered: 'border-warn text-warn',
    won: 'border-good text-good',
    lost: 'border-bad text-bad',
    ghosted: 'border-edge text-muted',
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${tone[stage] ?? 'border-edge text-muted'}`}>
      {label}
    </span>
  );
}

export function HandlerBadge({ by, labels }: {
  by: string | null;
  labels: { bot: string; human: string; none: string };
}) {
  if (by === 'bot') return <span className="rounded bg-[#3987e5]/15 px-1.5 py-0.5 text-[11px] text-[#3987e5]">{labels.bot}</span>;
  if (by === 'human') return <span className="rounded bg-good/15 px-1.5 py-0.5 text-[11px] text-good">{labels.human}</span>;
  return <span className="rounded bg-edge px-1.5 py-0.5 text-[11px] text-muted">{labels.none}</span>;
}

/** Single-series bar chart. One measure only — never two scales on one axis. */
export function BarChart({
  data, color = 'var(--series-1)', height = 120, format,
}: {
  data: { label: string; value: number }[];
  color?: string; height?: number; format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = format ?? ((n: number) => String(Math.round(n)));
  const w = 100 / Math.max(data.length, 1);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none"
           className="w-full" style={{ height }} role="img">
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 16);
          return (
            <g key={i}>
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
              <rect
                x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={Math.max(h, d.value > 0 ? 1.5 : 0)}
                rx={Math.min(1.2, w * 0.3)} fill={color}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Ordinal funnel: one hue, dark→light down the stages. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const ramp = ['#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="w-24 shrink-0 text-xs text-muted">{s.label}</div>
          <div className="h-5 flex-1 rounded bg-edge/50">
            <div className="h-5 rounded" style={{
              width: `${Math.max((s.value / max) * 100, s.value ? 2 : 0)}%`,
              background: ramp[Math.min(i, ramp.length - 1)],
            }} />
          </div>
          <div className="w-16 shrink-0 text-right text-sm tabular-nums">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ConvoLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <Link href={`/inbox/${id}`} className="hover:text-brand">{children}</Link>;
}

export function money(n: number | null | undefined, cur = 'MMK', digits = 0) {
  if (n == null) return '—';
  // Sub-unit amounts (a $0.30 cost per lead) round to nothing without decimals.
  const d = digits || (cur !== 'MMK' && Math.abs(n) < 10 ? 2 : 0);
  return `${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })} ${cur}`;
}
export function num(n: number | null | undefined, digits = 0) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
/** Relative time, worded by the caller's language. */
export function ago(iso: string | null, tr: (k: string, v?: Record<string, string | number>) => string) {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return tr('t_just_now');
  if (m < 60) return tr('t_min', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tr('t_hour', { n: h });
  return tr('t_day', { n: Math.floor(h / 24) });
}
