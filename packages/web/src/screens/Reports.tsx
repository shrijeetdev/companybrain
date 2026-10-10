import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Report } from '@companybrain/types';
import { api } from '../api/endpoints';
import { qk, useMemberMap, useProjectMap } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { ErrorState, Ring, Segmented, Skeleton, Ticker } from '../components/ui';
import { useLabels } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { cx } from '../lib/util';

export function Reports() {
  const L = useLabels();
  const { tactical } = useTheme();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data: r, error, refetch } = useQuery({ queryKey: qk.reports(Number(days)), queryFn: () => api.reports.get(Number(days)) });
  return (
    <>
      <div className="page-head">
        <div><h1>{tactical ? 'After-Action Report' : L.reports}</h1><div className="sub">How the team — humans and AI — is shipping.</div></div>
        <div className="actions"><Segmented label="Window" value={days} onChange={setDays} options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }]} /></div>
      </div>
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : !r ? <div className="panel panel-pad"><Skeleton h={320} /></div> : <ReportBody r={r} />}
    </>
  );
}

function ReportBody({ r }: { r: Report }) {
  const L = useLabels();
  const members = useMemberMap();
  const projects = useProjectMap();
  const total = r.humansVsAgents.humans + r.humansVsAgents.agents;
  const agentPct = total ? Math.round((r.humansVsAgents.agents / total) * 100) : 0;
  const byMember = [...r.byMember].sort((a, b) => b.completed - a.completed);
  const maxM = Math.max(1, ...byMember.map((m) => m.completed));
  const byProject = [...r.byProject].sort((a, b) => b.completed + b.open - (a.completed + a.open));
  const maxP = Math.max(1, ...byProject.map((p) => p.open + p.completed));
  return (
    <>
      <div className="stat-cards">
        <div className="panel stat-card"><div className="eyebrow">Completed</div><b className="num-display"><Ticker value={r.totals.completed} /></b><div className="delta">{r.totals.created} created in {r.windowDays} days</div></div>
        <div className="panel stat-card"><div className="eyebrow">On-time rate</div><b className="num-display"><Ticker value={Math.round(r.totals.onTimeRate * 100)} />%</b><div className="delta">of {L.tasksLower} with a deadline</div></div>
        <div className="panel stat-card"><div className="eyebrow">Avg cycle time</div><b className="num-display"><Ticker value={r.totals.avgCycleHours} format={(n) => n.toFixed(1)} />h</b><div className="delta">created → done</div></div>
        <div className="panel stat-card"><div className="eyebrow">{L.overdue} now</div><b className="num-display" style={{ color: r.totals.overdueNow ? 'var(--danger)' : undefined }}><Ticker value={r.totals.overdueNow} /></b><div className="delta">across the team</div></div>
      </div>
      <TrendChart r={r} />
      <div className="two-col" style={{ marginTop: 14 }}>
        <section className="panel">
          <div className="panel-head"><h2>Completed by {L.teammate.toLowerCase()}</h2></div>
          <ul className="hbars">
            {byMember.map((m, i) => {
              const mem = members.get(m.memberId);
              return (
                <li key={m.memberId} title={`${mem?.name}: ${m.completed} completed · ${Math.round(m.onTimeRate * 100)}% on time · ${m.overdue} overdue`}>
                  <Avatar member={mem} size={22} />
                  <span className="hb-name truncate">{mem?.name.split(' ')[0] ?? '—'}</span>
                  <span className="hb-track"><motion.i initial={{ width: 0 }} animate={{ width: `${(m.completed / maxM) * 100}%` }} transition={{ delay: i * 0.04, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} style={{ background: mem?.kind === 'agent' ? 'var(--chart-2)' : 'var(--chart-1)' }} /></span>
                  <span className="hb-val num">{m.completed}</span>
                  <span className="hb-sub num faint">{Math.round(m.onTimeRate * 100)}%</span>
                </li>
              );
            })}
          </ul>
          <div className="legend" style={{ padding: '0 18px 14px' }}><span><i style={{ background: 'var(--chart-1)' }} />{L.humans}</span><span><i style={{ background: 'var(--chart-2)' }} />{L.agents}</span><span className="faint">% = on time</span></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>{L.humans} vs {L.agents}</h2></div>
          <div className="hva">
            <Ring pct={100 - agentPct} size={150} stroke={16} color="var(--chart-1)" track="var(--chart-2)">
              <span className="num-display" style={{ fontSize: 28, fontWeight: 750 }}><Ticker value={total} /></span>
              <span className="ring-sub">completed</span>
            </Ring>
            <div className="stack" style={{ gap: 12 }}>
              <div className="hva-row"><i style={{ background: 'var(--chart-1)' }} /><div><b className="num-display"><Ticker value={r.humansVsAgents.humans} /></b><span>{L.humans} · {100 - agentPct}%</span></div></div>
              <div className="hva-row"><i style={{ background: 'var(--chart-2)' }} /><div><b className="num-display"><Ticker value={r.humansVsAgents.agents} /></b><span>{L.agents} · {agentPct}%</span></div></div>
            </div>
          </div>
          <div className="panel-head" style={{ paddingTop: 4 }}><h3>By {L.project.toLowerCase()}</h3></div>
          <ul className="hbars">
            {byProject.map((p, i) => {
              const pr = p.projectId ? projects.get(p.projectId) : null;
              return (
                <li key={p.projectId ?? 'none'} title={`${pr?.name ?? 'No project'}: ${p.completed} done · ${p.open} open`}>
                  <span style={{ width: 22, textAlign: 'center' }}>{pr?.emoji ?? '·'}</span>
                  <span className="hb-name truncate">{pr?.name ?? `No ${L.project.toLowerCase()}`}</span>
                  <span className="hb-track stacked">
                    <motion.i initial={{ width: 0 }} animate={{ width: `${(p.completed / maxP) * 100}%` }} transition={{ delay: i * 0.04, duration: 0.7 }} style={{ background: 'var(--chart-1)' }} />
                    <motion.i initial={{ width: 0 }} animate={{ width: `${(p.open / maxP) * 100}%` }} transition={{ delay: i * 0.04 + 0.1, duration: 0.7 }} style={{ background: 'var(--border-strong)' }} />
                  </span>
                  <span className="hb-val num">{p.completed}</span>
                  <span className="hb-sub num faint">{p.open} open</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

/** Completed vs created per day — one axis, two series, crosshair tooltip, legend + table view. */
function TrendChart({ r }: { r: Report }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(300, Math.round(el.clientWidth - 24))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);
  const H = W < 600 ? 200 : 240;
  const pad = { l: 34, r: 12, t: 14, b: 26 };
  const n = r.daily.length;
  const max = Math.max(4, ...r.daily.flatMap((d) => [d.created, d.completed]));
  const niceMax = Math.ceil(max / 4) * 4;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const path = (key: 'created' | 'completed') => r.daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join('');
  const area = `${path('completed')}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const ticks = [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];
  const labelEvery = Math.ceil(n / Math.max(3, Math.floor(W / 110)));
  const fmtDay = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const h = hover !== null ? r.daily[hover] : null;
  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const totals = useMemo(() => ({ c: r.daily.reduce((s, d) => s + d.completed, 0), k: r.daily.reduce((s, d) => s + d.created, 0) }), [r]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Completed vs created</h2>
        <span className="spacer" />
        <div className="legend"><span><i style={{ background: 'var(--chart-1)' }} />Completed · {totals.c}</span><span><i className="dash" style={{ background: 'var(--chart-2)' }} />Created · {totals.k}</span></div>
        <button className={cx('icon-btn icon-btn-sm')} aria-pressed={table} aria-label="Show as table" onClick={() => setTable((t) => !t)}><Table2 /></button>
      </div>
      {table ? (
        <div style={{ maxHeight: 260, overflow: 'auto', padding: '0 18px 14px' }}>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Completed</th><th>Created</th></tr></thead>
            <tbody>{r.daily.map((d) => <tr key={d.date}><td>{fmtDay(d.date)}</td><td className="num">{d.completed}</td><td className="num">{d.created}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={wrap} onPointerLeave={() => setHover(null)}>
          <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart" onPointerMove={onMove} role="img" aria-label={`Completed vs created over ${r.windowDays} days`}>
            <defs>
              <linearGradient id="cmpArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
              </g>
            ))}
            {r.daily.map((d, i) => ((i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.7) || i === n - 1) && <text key={d.date} x={x(i)} y={H - 6} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="axis">{fmtDay(d.date)}</text>)}
            <motion.path d={area} fill="url(#cmpArea)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
            <motion.path d={path('created')} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
            <motion.path d={path('completed')} fill="none" stroke="var(--chart-1)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
            {hover !== null && h && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={x(hover)} cy={y(h.created)} r="4.5" fill="var(--chart-2)" stroke="var(--surface-solid)" strokeWidth="2" />
                <circle cx={x(hover)} cy={y(h.completed)} r="4.5" fill="var(--chart-1)" stroke="var(--surface-solid)" strokeWidth="2" />
              </g>
            )}
          </svg>
          {hover !== null && h && (
            <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
              <b>{fmtDay(h.date)}</b>
              <span><i style={{ background: 'var(--chart-1)' }} />Completed <b className="num">{h.completed}</b></span>
              <span><i style={{ background: 'var(--chart-2)' }} />Created <b className="num">{h.created}</b></span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
