import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Award, Medal, Package, Target, Timer, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { Rank } from '@companybrain/types';
import { Portal } from '../../components/Overlay';
import { Ticker } from '../../components/ui';
import { dismissOverlay, useFx, type Burst, type Floater, type Overlay } from '../../lib/gameFx';
import { useLabels } from '../../lib/labels';
import { useTheme } from '../../lib/theme';
import { fmtDuration } from '../../lib/time';
import { cx } from '../../lib/util';
import { Insignia } from './Insignia';

const PALETTE_TAC = ['#ffb020', '#22d3ee', '#a3e635', '#ffd166', '#ffffff'];
const PALETTE_CLASSIC = ['#3b6ff6', '#7c5cff', '#10b981', '#f59e0b', '#ec4899'];

function BurstFx({ b, palette }: { b: Burst; palette: string[] }) {
  const parts = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.35;
    const d = 38 + Math.random() * 46;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, rot: Math.random() * 360, c: palette[i % palette.length]!, w: 3 + Math.random() * 5, h: 2 + Math.random() * 3 };
  }), [palette]);
  return (
    <div className="fx-burst" style={{ left: b.x, top: b.y }} aria-hidden>
      <motion.span className="fx-ring" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} />
      <motion.span className="fx-ring fx-ring-2" initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }} />
      {parts.map((p, i) => (
        <motion.i key={i} style={{ background: p.c, width: p.w, height: p.h }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: p.dx, y: p.dy + 12, opacity: 0, rotate: p.rot, scale: 0.6 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }} />
      ))}
    </div>
  );
}

function FloaterView({ f }: { f: Floater }) {
  const L = useLabels();
  const icon = f.tone === 'crate' ? <Package /> : f.tone === 'medal' ? <Medal /> : f.tone === 'challenge' ? <Target /> : f.tone === 'bonus' ? <Zap /> : null;
  return (
    <motion.div
      layout
      className={cx('floater', `tone-${f.tone}`, f.rarity && `rarity-${f.rarity}`)}
      initial={{ opacity: 0, y: 18, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.96, transition: { duration: 0.3 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      role="status"
    >
      {icon && <span className="floater-icon">{icon}</span>}
      {f.xp !== 0 && <span className="floater-xp num-display">{f.xp > 0 ? '+' : ''}{f.xp} {L.xp}</span>}
      <span className="floater-text truncate">{f.text}</span>
      {f.coins > 0 && <span className="floater-coins num">+{f.coins} ◎</span>}
    </motion.div>
  );
}

function Debris({ palette, count = 36 }: { palette: string[]; count?: number }) {
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 900, y: -200 - Math.random() * 300, r: Math.random() * 720 - 360,
    c: palette[i % palette.length]!, w: 4 + Math.random() * 8, h: 3 + Math.random() * 5, d: Math.random() * 0.25,
  })), [palette, count]);
  return (
    <div className="debris" aria-hidden>
      {parts.map((p, i) => (
        <motion.i key={i} style={{ background: p.c, width: p.w, height: p.h }}
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
    <motion.div className="celebrate" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label={`${L.levelUp}: level ${level}`}>
      <div className="celebrate-bg" style={{ ['--glow' as string]: color }} />
      {!reduce && <motion.div className="rays" style={{ ['--glow' as string]: color }} initial={{ rotate: 0, scale: 0.6, opacity: 0 }} animate={{ rotate: 40, scale: 1, opacity: 1 }} transition={{ duration: 3.2, ease: 'easeOut' }} />}
      {!reduce && <Debris palette={tactical ? PALETTE_TAC : PALETTE_CLASSIC} />}
      <div className="celebrate-inner">
        <motion.div className="eyebrow celebrate-kicker" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
          {promoted ? L.rankUp : L.levelUp}
        </motion.div>
        {rank && (
          <motion.div initial={reduce ? { opacity: 0 } : { scale: 0.2, rotate: -25, opacity: 0 }} animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 12, delay: 0.25 }}>
            <Insignia rank={rank} size={128} glow />
          </motion.div>
        )}
        <motion.div className="celebrate-level display" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}>
          Level <Ticker value={level} duration={1.2} />
        </motion.div>
        {rank && <motion.div className="celebrate-rank" style={{ color }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>{promoted ? `New rank: ${rank.name}` : rank.name}</motion.div>}
        <motion.div className="celebrate-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>Tap to continue</motion.div>
      </div>
    </motion.div>
  );
}

function SectorCleared({ o, onClose }: { o: Extract<Overlay, { kind: 'sector' }>; onClose: () => void }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const reduce = useReducedMotion();
  return (
    <motion.div className={cx('celebrate sector')} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label={L.sectorCleared}>
      <div className="celebrate-bg" style={{ ['--glow' as string]: 'var(--success)' }} />
      {!reduce && <Debris palette={tactical ? PALETTE_TAC : PALETTE_CLASSIC} count={48} />}
      <div className="celebrate-inner">
        {tactical && !reduce && <motion.div className="sector-scan" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />}
        <motion.div className="sector-title display" initial={reduce ? { opacity: 0 } : { letterSpacing: '0.6em', opacity: 0, scale: 1.2 }} animate={{ letterSpacing: tactical ? '0.12em' : '-0.02em', opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          {tactical ? L.sectorCleared : `${L.sectorCleared} 🎉`}
        </motion.div>
        <motion.p className="sector-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{L.allClearBody}</motion.p>
        <div className="sector-stats">
          {[
            { icon: <Award />, label: L.tasks, value: o.missions, fmt: (n: number) => String(Math.round(n)) },
            { icon: <Zap />, label: `${L.xp} earned`, value: o.xp, fmt: (n: number) => `+${Math.round(n)}` },
            { icon: <Target />, label: 'Accuracy', value: Math.round(o.accuracy * 100), fmt: (n: number) => `${Math.round(n)}%` },
            { icon: <Timer />, label: 'Time', value: o.durationMs, fmt: (n: number) => fmtDuration(n) },
          ].map((s, i) => (
            <motion.div key={s.label} className="sector-stat" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.12 }}>
              {s.icon}
              <b className="num-display"><Ticker value={s.value} format={s.fmt} duration={1.4} /></b>
              <span>{s.label}</span>
            </motion.div>
          ))}
        </div>
        <motion.div className="celebrate-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>Tap to continue</motion.div>
      </div>
    </motion.div>
  );
}

/** Global layer for all game celebrations. Everything is pointer-transparent except overlays (tap to dismiss). */
export function FxLayer() {
  const fx = useFx();
  const { tactical } = useTheme();
  const reduce = useReducedMotion();
  const palette = tactical ? PALETTE_TAC : PALETTE_CLASSIC;
  const timer = useRef(0);

  useEffect(() => {
    if (!fx.overlay) return;
    const ms = fx.overlay.kind === 'levelUp' ? 3400 : 4200;
    timer.current = window.setTimeout(dismissOverlay, ms);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dismissOverlay(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.clearTimeout(timer.current); window.removeEventListener('keydown', onKey, true); };
  }, [fx.overlay]);

  return (
    <Portal>
      <div className="fx-layer" aria-live="polite">
        {fx.bursts.map((b) => <BurstFx key={b.id} b={b} palette={palette} />)}
        <AnimatePresence>
          {fx.flash > 0 && !reduce && tactical && (
            <motion.div key={fx.flash} className="edge-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {fx.deploy > 0 && !reduce && (
            <motion.div key={`d${fx.deploy}`} className="deploy-ping" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1 }}>
              <motion.span initial={{ scale: 0.1, opacity: 0.9 }} animate={{ scale: 3, opacity: 0 }} transition={{ duration: 1, ease: 'easeOut' }} />
              <motion.span initial={{ scale: 0.1, opacity: 0.7 }} animate={{ scale: 2, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="floaters">
          <AnimatePresence>{fx.floaters.map((f) => <FloaterView key={f.id} f={f} />)}</AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {fx.overlay?.kind === 'levelUp' && <LevelUp key="lvl" level={fx.overlay.level} rank={fx.overlay.rank} promoted={fx.overlay.promoted} onClose={dismissOverlay} />}
        {fx.overlay?.kind === 'sector' && <SectorCleared key="sector" o={fx.overlay} onClose={dismissOverlay} />}
      </AnimatePresence>
    </Portal>
  );
}
