// Full-screen celebrations (level-up / rank-up, sector cleared). Lazy-loaded by <FxLayer/>.
import { m, useReducedMotion } from 'motion/react';
import { Award, Target, Timer, Zap } from 'lucide-react';
import { useMemo } from 'react';
import type { Rank } from '@companybrain/types';
import { Ticker } from '../../components/ui';
import type { Overlay } from '../../lib/gameFx';
import { useLabels } from '../../lib/labels';
import { useTheme } from '../../lib/theme';
import { fmtDuration } from '../../lib/time';
import { cx } from '../../lib/util';
import { Insignia } from './Insignia';
import { PALETTE_CLASSIC, PALETTE_TAC } from './palette';

function Debris({ palette, count = 36 }: { palette: string[]; count?: number }) {
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 900, y: -200 - Math.random() * 300, r: Math.random() * 720 - 360,
    c: palette[i % palette.length]!, w: 4 + Math.random() * 8, h: 3 + Math.random() * 5, d: Math.random() * 0.25,
  })), [palette, count]);
  return (
    <div className="debris" aria-hidden>
      {parts.map((p, i) => (
        <m.i key={i} style={{ background: p.c, width: p.w, height: p.h }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 700], opacity: [1, 1, 0], rotate: p.r }}
          transition={{ duration: 2.4, delay: p.d, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.35, 1] }} />
      ))}
    </div>
  );
}

function LevelUp({ level, rank, promoted, onClose }: { level: number; rank: Rank | null; promoted: boolean; onClose: () => void }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const reduce = useReducedMotion();
  const color = rank?.insignia.color ?? 'var(--accent)';
  return (
    <m.div className="celebrate" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label={`${L.levelUp}: level ${level}`}>
      <div className="celebrate-bg" style={{ ['--glow' as string]: color }} />
      {!reduce && <m.div className="rays" style={{ ['--glow' as string]: color }} initial={{ rotate: 0, scale: 0.6, opacity: 0 }} animate={{ rotate: 40, scale: 1, opacity: 1 }} transition={{ duration: 3.2, ease: 'easeOut' }} />}
      {!reduce && <Debris palette={tactical ? PALETTE_TAC : PALETTE_CLASSIC} />}
      <div className="celebrate-inner">
        <m.div className="eyebrow celebrate-kicker" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
          {promoted ? L.rankUp : L.levelUp}
        </m.div>
        {rank && (
          <m.div initial={reduce ? { opacity: 0 } : { scale: 0.2, rotate: -25, opacity: 0 }} animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 12, delay: 0.25 }}>
            <Insignia rank={rank} size={128} glow />
          </m.div>
        )}
        <m.div className="celebrate-level display" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}>
          Level <Ticker value={level} duration={1.2} />
        </m.div>
        {rank && <m.div className="celebrate-rank" style={{ color }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>{promoted ? `New rank: ${rank.name}` : rank.name}</m.div>}
        <m.div className="celebrate-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>Tap to continue</m.div>
      </div>
    </m.div>
  );
}

function SectorCleared({ o, onClose }: { o: Extract<Overlay, { kind: 'sector' }>; onClose: () => void }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const reduce = useReducedMotion();
  return (
    <m.div className={cx('celebrate sector')} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label={L.sectorCleared}>
      <div className="celebrate-bg" style={{ ['--glow' as string]: 'var(--success)' }} />
      {!reduce && <Debris palette={tactical ? PALETTE_TAC : PALETTE_CLASSIC} count={48} />}
      <div className="celebrate-inner">
        {tactical && !reduce && <m.div className="sector-scan" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />}
        <m.div className="sector-title display" initial={reduce ? { opacity: 0 } : { letterSpacing: '0.6em', opacity: 0, scale: 1.2 }} animate={{ letterSpacing: tactical ? '0.12em' : '-0.02em', opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          {tactical ? L.sectorCleared : `${L.sectorCleared} 🎉`}
        </m.div>
        <m.p className="sector-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{L.allClearBody}</m.p>
        <div className="sector-stats">
          {[
            { icon: <Award />, label: L.tasks, value: o.missions, fmt: (n: number) => String(Math.round(n)) },
            { icon: <Zap />, label: `${L.xp} earned`, value: o.xp, fmt: (n: number) => `+${Math.round(n)}` },
            { icon: <Target />, label: 'Accuracy', value: Math.round(o.accuracy * 100), fmt: (n: number) => `${Math.round(n)}%` },
            { icon: <Timer />, label: 'Time', value: o.durationMs, fmt: (n: number) => fmtDuration(n) },
          ].map((s, i) => (
            <m.div key={s.label} className="sector-stat" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.12 }}>
              {s.icon}
              <b className="num-display"><Ticker value={s.value} format={s.fmt} duration={1.4} /></b>
              <span>{s.label}</span>
            </m.div>
          ))}
        </div>
        <m.div className="celebrate-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>Tap to continue</m.div>
      </div>
    </m.div>
  );
}

export function Celebration({ overlay, onClose }: { overlay: Overlay; onClose: () => void }) {
  return overlay.kind === 'levelUp'
    ? <LevelUp level={overlay.level} rank={overlay.rank} promoted={overlay.promoted} onClose={onClose} />
    : <SectorCleared o={overlay} onClose={onClose} />;
}
