import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Coins, Crown, Frame, Smile, Zap } from 'lucide-react';
import { useState } from 'react';
import type { Crate, CrateReward, Rarity } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk } from '../../api/queries';
import { Modal } from '../../components/Overlay';
import { sfx } from '../../lib/sfx';
import { toast } from '../../lib/toast';
import { cx } from '../../lib/util';

export const RARITY_COLOR: Record<Rarity, string> = { common: '#9aa4b2', rare: '#22d3ee', epic: '#a78bfa', legendary: '#facc15' };

/** Original crate art: a reinforced supply box tinted by rarity. */
export function CrateArt({ rarity, size = 84, open }: { rarity: Rarity; size?: number; open?: boolean }) {
  const c = RARITY_COLOR[rarity];
  return (
    <svg className="crate-art" width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <defs>
        <linearGradient id={`cb-${rarity}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b3a4d" /><stop offset="1" stopColor="#141d2a" /></linearGradient>
        <linearGradient id={`ce-${rarity}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity="0.55" /></linearGradient>
      </defs>
      <ellipse cx="48" cy="86" rx="30" ry="5" fill={c} opacity="0.25" />
      <g transform={open ? 'translate(0 -10) rotate(-12 20 30)' : undefined} style={{ transition: 'transform .3s' }}>
        <path d="M14 26h68l-4 12H18z" fill={`url(#cb-${rarity})`} stroke={`url(#ce-${rarity})`} strokeWidth="2.5" />
        <rect x="40" y="26" width="16" height="12" fill={c} opacity="0.85" />
      </g>
      <path d="M18 40h60v40H18z" fill={`url(#cb-${rarity})`} stroke={`url(#ce-${rarity})`} strokeWidth="2.5" />
      <path d="M18 40l60 40M78 40 18 80" stroke={c} strokeOpacity="0.3" strokeWidth="2" />
      <rect x="40" y="52" width="16" height="14" rx="2" fill="#0b121c" stroke={c} strokeWidth="2" />
      <circle cx="48" cy="59" r="2.5" fill={c} />
      {[24, 72].map((x) => <rect key={x} x={x - 3} y="40" width="6" height="40" fill={c} opacity="0.55" />)}
    </svg>
  );
}

function RewardIcon({ r }: { r: CrateReward }) {
  const p = { width: 28, height: 28 };
  if (r.kind === 'coins') return <Coins {...p} />;
  if (r.kind === 'xp_boost') return <Zap {...p} />;
  if (r.kind === 'frame') return <Frame {...p} />;
  if (r.kind === 'emote') return <Smile {...p} />;
  return <Crown {...p} />;
}

type Stage = 'ready' | 'shaking' | 'burst' | 'reveal';

export function CrateOpener({ crate, onClose }: { crate: Crate | null; onClose: () => void }) {
  return (
    <Modal open={!!crate} onClose={onClose} label="Open crate" width={420}>
      {crate && <OpenerBody key={crate.id} crate={crate} onClose={onClose} />}
    </Modal>
  );
}

function OpenerBody({ crate, onClose }: { crate: Crate; onClose: () => void }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(crate.openedAt ? 'reveal' : 'ready');
  const [reward, setReward] = useState<CrateReward | null>(crate.reward);
  const color = RARITY_COLOR[crate.rarity];
  const open = async () => {
    setStage('shaking');
    sfx.crateShake();
    const started = Date.now();
    try {
      const res = await api.game.openCrate(crate.id);
      await new Promise((ok) => window.setTimeout(ok, Math.max(0, (reduce ? 100 : 900) - (Date.now() - started))));
      setReward(res.reward);
      setStage('burst');
      sfx.crateOpen();
      window.setTimeout(() => setStage('reveal'), reduce ? 50 : 450);
      void qc.invalidateQueries({ queryKey: qk.game.all });
    } catch (e) {
      toast.error(errorMessage(e));
      setStage('ready');
    }
  };
  return (
    <div className={cx('crate-stage', `rarity-${crate.rarity}`)} onClick={stage === 'ready' ? () => void open() : undefined}>
      <m.div className="crate-glow" animate={{ opacity: stage === 'ready' ? 0.5 : stage === 'shaking' ? 0.8 : 1, scale: stage === 'burst' ? 1.6 : 1 }} transition={{ duration: 0.4 }} />
      <div className="rarity-label" style={{ position: 'relative' }}>{crate.rarity} crate</div>
      <m.div style={{ position: 'relative' }}
        animate={stage === 'shaking' && !reduce ? { rotate: [0, -6, 6, -9, 9, -4, 4, 0], scale: [1, 1.02, 1.04, 1.06, 1.08, 1.1, 1.12, 1.1] } : stage === 'burst' ? { scale: 1.3, opacity: 0 } : stage === 'reveal' ? { scale: 0.5, opacity: 0, y: -10 } : { scale: 1 }}
        transition={stage === 'shaking' ? { duration: 0.9, ease: 'easeInOut' } : { duration: 0.35 }}>
        <CrateArt rarity={crate.rarity} size={150} open={stage === 'burst' || stage === 'reveal'} />
      </m.div>
      <AnimatePresence>
        {stage === 'burst' && !reduce && (
          <m.div key="flash" style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 45%, ${color}, transparent 60%)` }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.5 }} />
        )}
      </AnimatePresence>
      {stage === 'reveal' && reward ? (
        <m.div style={{ position: 'relative', display: 'grid', justifyItems: 'center', gap: 8, marginTop: -120 }} initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
          {!reduce && <m.span className="reward-rays" style={{ ['--rar' as string]: color }} initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 1, rotate: 90 }} transition={{ duration: 4, ease: 'linear' }} aria-hidden />}
          <span className="inv-swatch" style={{ position: 'relative', width: 72, height: 72, color, background: `color-mix(in srgb, ${color} 18%, transparent)`, boxShadow: `0 0 30px ${color}` }}><RewardIcon r={reward} /></span>
          <div className="crate-reward-name" style={{ color }}>{reward.kind === 'coins' ? `+${reward.amount} credits` : reward.name}</div>
          <div className="faint" style={{ fontSize: 13 }}>{reward.kind === 'title' ? 'New title — equip it in the Armory' : reward.kind === 'frame' ? 'New avatar frame' : reward.kind === 'emote' ? 'New emote' : reward.kind === 'xp_boost' ? `${reward.amount} min of bonus XP` : 'Added to your balance'}</div>
          <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={onClose}>Collect</button>
        </m.div>
      ) : stage === 'ready' ? (
        <div style={{ position: 'relative', display: 'grid', gap: 10, justifyItems: 'center' }}>
          <div className="faint" style={{ fontSize: 13 }}>Earned: {crate.source}</div>
          <button className="btn btn-primary btn-lg" data-autofocus onClick={(e) => { e.stopPropagation(); void open(); }}>Open crate</button>
        </div>
      ) : <div className="faint" style={{ position: 'relative', height: 70 }}>Unlocking…</div>}
    </div>
  );
}
