import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Medal, Package, Target, Zap } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { Portal } from '../../components/Overlay';
import { dismissOverlay, useFx, type Burst, type Floater } from '../../lib/gameFx';
import { useLabels } from '../../lib/labels';
import { useTheme } from '../../lib/theme';
import { cx } from '../../lib/util';

import { PALETTE_CLASSIC, PALETTE_TAC } from './palette';

/** Full-screen level-up / sector-cleared screens: rare, so loaded on first use. */
const Celebration = lazy(() => import('./Celebrations').then((m) => ({ default: m.Celebration })));

function BurstFx({ b, palette }: { b: Burst; palette: string[] }) {
  const parts = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.35;
    const d = 38 + Math.random() * 46;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, rot: Math.random() * 360, c: palette[i % palette.length]!, w: 3 + Math.random() * 5, h: 2 + Math.random() * 3 };
  }), [palette]);
  return (
    <div className="fx-burst" style={{ left: b.x, top: b.y }} aria-hidden>
      <m.span className="fx-ring" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} />
      <m.span className="fx-ring fx-ring-2" initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }} />
      {parts.map((p, i) => (
        <m.i key={i} style={{ background: p.c, width: p.w, height: p.h }}
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
    <m.div
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
    </m.div>
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
            <m.div key={fx.flash} className="edge-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {fx.deploy > 0 && !reduce && (
            <m.div key={`d${fx.deploy}`} className="deploy-ping" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1 }}>
              <m.span initial={{ scale: 0.1, opacity: 0.9 }} animate={{ scale: 3, opacity: 0 }} transition={{ duration: 1, ease: 'easeOut' }} />
              <m.span initial={{ scale: 0.1, opacity: 0.7 }} animate={{ scale: 2, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }} />
            </m.div>
          )}
        </AnimatePresence>
        <div className="floaters">
          <AnimatePresence>{fx.floaters.map((f) => <FloaterView key={f.id} f={f} />)}</AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {fx.overlay && (
          <Suspense key={fx.overlay.kind} fallback={null}>
            <Celebration overlay={fx.overlay} onClose={dismissOverlay} />
          </Suspense>
        )}
      </AnimatePresence>
    </Portal>
  );
}
