import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Play, RotateCcw, Square } from 'lucide-react';
import type { Briefing, Member } from '@companybrain/types';
import { Spinner } from '../../components/ui';
import { useLabels } from '../../lib/labels';
import { useTheme } from '../../lib/theme';
import { cx } from '../../lib/util';
import { useBriefingVoice } from './voice';

function Waveform({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const bars = 18;
  return (
    <div className={cx('wave', active && 'on')} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <motion.i key={i}
          animate={active && !reduce ? { scaleY: [0.25, 0.4 + Math.abs(Math.sin(i * 1.7)) * 0.6, 0.3, 0.9 - (i % 4) * 0.12, 0.25] } : { scaleY: 0.18 + Math.abs(Math.sin(i)) * 0.12 }}
          transition={active && !reduce ? { duration: 0.9 + (i % 5) * 0.13, repeat: Infinity, ease: 'easeInOut', delay: i * 0.03 } : { duration: 0.3 }} />
      ))}
    </div>
  );
}

function Orb({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className={cx('orb', active && 'on')} aria-hidden>
      <motion.span className="orb-core" animate={active && !reduce ? { scale: [1, 1.12, 0.96, 1.08, 1] } : { scale: 1 }} transition={{ duration: 2.2, repeat: active ? Infinity : 0 }} />
      {active && !reduce && [0, 1, 2].map((i) => (
        <motion.span key={i} className="orb-ring" initial={{ scale: 0.8, opacity: 0.6 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }} />
      ))}
    </div>
  );
}

export function BriefingPlayer({ briefing, me }: { briefing: Briefing; me: Member }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const mode = me.prefs.briefingVoice ?? 'auto';
  const v = useBriefingVoice({ memberId: me.id, text: briefing.spoken, mode, voiceName: me.prefs.voiceName });
  if (mode === 'off') return null;
  const speaking = v.state === 'speaking';
  const showCaptions = speaking || v.state === 'loading';

  return (
    <div className={cx('briefing', speaking && 'live')} aria-label={L.briefing}>
      <div className="briefing-row">
        {tactical ? <Waveform active={speaking} /> : <Orb active={speaking} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="briefing-kicker">
            {tactical && <span className={cx('rec', speaking && 'on')} />}
            <span className="eyebrow">{speaking ? (tactical ? 'Transmission live' : 'Speaking') : L.briefing}</span>
            {tactical && <span className="comm-id mono">CH-{me.initials}-{new Date(briefing.generatedAt).getUTCDate().toString().padStart(2, '0')}</span>}
          </div>
          {!showCaptions && <div className="briefing-teaser truncate">{v.sentences[1] ?? v.sentences[0]}</div>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {v.state === 'loading' && <Spinner />}
          {speaking || v.state === 'loading' ? (
            <button className="btn btn-sm" onClick={v.stop} aria-label="Stop briefing"><Square /> Stop</button>
          ) : v.state === 'done' ? (
            <button className="btn btn-sm" onClick={() => void v.play()} aria-label="Replay briefing"><RotateCcw /> Replay</button>
          ) : (
            <motion.button className={cx('btn btn-primary btn-sm play-pill', v.state === 'blocked' && 'attn')} onClick={() => void v.play()}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Play /> {L.playBriefing}
            </motion.button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showCaptions && (
          <motion.p className="captions" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} aria-live="polite">
            {v.sentences.map((s, i) => (
              <span key={i} className={cx(i === v.index && 'cur', i < v.index && 'past')}>{s} </span>
            ))}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
