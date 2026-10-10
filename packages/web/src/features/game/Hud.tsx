import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, m as motion } from 'motion/react';
import { Check, Coins, Flame, Package, Volume2, VolumeX, Zap } from 'lucide-react';
import { Link } from 'wouter';
import type { DailyChallenge, FeedItem, Hud, Member, MissionProgress } from '@companybrain/types';
import { api } from '../../api/endpoints';
import { qk, useFlash, useHud, useMe, useMemberMap } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { Bar, Ring, Skeleton, Ticker } from '../../components/ui';
import { useLabels } from '../../lib/labels';
import { setMuted, useSound } from '../../lib/sfx';
import { useTheme } from '../../lib/theme';
import { ago } from '../../lib/time';
import { cx, firstName } from '../../lib/util';
import { Insignia } from './Insignia';

export function MuteButton() {
  const s = useSound();
  const off = s.muted || !s.pref;
  return (
    <button className="icon-btn icon-btn-sm" aria-pressed={!off} aria-label={off ? 'Unmute sound effects' : 'Mute sound effects'} title={off ? 'Sound off' : 'Sound on'}
      onClick={() => setMuted(!s.muted)} disabled={!s.pref}>
      {off ? <VolumeX /> : <Volume2 />}
    </button>
  );
}

/** Compact HUD for the top bar. */
export function HudCompact() {
  const { data: hud } = useHud();
  const me = useMe();
  const L = useLabels();
  if (!hud) return <div className="hud-compact"><Skeleton w={180} h={22} /></div>;
  const p = hud.profile;
  const pct = (p.levelProgressXp / Math.max(1, p.levelXp)) * 100;
  return (
    <div className="hud-compact" aria-label={`${p.rank.name}, level ${p.level}`}>
      <Link href="/armory" className="hud-id" title={`${p.rank.name} · ${p.levelProgressXp}/${p.levelXp} XP`}>
        <Avatar member={me} size={26} frame={p.equipped.frame} />
        <Insignia rank={p.rank} size={22} />
        <span className="hud-lvl num-display"><small>{L.level}</small><Ticker value={p.level} /></span>
        <span className="hud-xp" aria-hidden><Bar pct={pct} color="linear-gradient(90deg, var(--xp), var(--xp-2))" /></span>
      </Link>
      <span className="hud-stat streak" title={`${p.streak.current}-day streak (best ${p.streak.best})`}><Flame /><Ticker value={p.streak.current} /></span>
      <span className="hud-stat coins hide-sm" title={L.coins}><Coins /><Ticker value={p.coins} /></span>
      {p.unopenedCrates > 0 && (
        <Link href="/armory" className="hud-crate" title={`${p.unopenedCrates} ${L.crates.toLowerCase()} to open`}>
          <Package />
          <span className="badge">{p.unopenedCrates}</span>
        </Link>
      )}
      <MuteButton />
    </div>
  );
}

/** Hero HUD on HQ: identity, rank, XP, streak, coins, crates. */
export function HudHero({ hud }: { hud: Hud }) {
  const me = useMe();
  const L = useLabels();
  const { tactical } = useTheme();
  const p = hud.profile;
  const pct = (p.levelProgressXp / Math.max(1, p.levelXp)) * 100;
  const toNext = p.levelXp - p.levelProgressXp;
  return (
    <section className="panel hud-hero" aria-label="Player status">
      <div className="hud-hero-id">
        <Avatar member={me} size={tactical ? 60 : 52} frame={p.equipped.frame} />
        <div className="grow" style={{ minWidth: 0 }}>
          {p.equipped.title && <div className="hud-title">{p.equipped.title}</div>}
          <div className="hud-name display truncate">{me.name}</div>
          <div className="hud-rank"><Insignia rank={p.rank} size={20} glow={tactical} /> {p.rank.name}</div>
        </div>
        <div className="hud-level">
          <span className="eyebrow">{L.level === 'LVL' ? 'Level' : L.level}</span>
          <span className="num-display"><Ticker value={p.level} /></span>
        </div>
      </div>
      <div className="hud-xpwrap">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="eyebrow">{L.xp}</span>
          <span className="num faint" style={{ fontSize: 12 }}>
            <Ticker value={p.levelProgressXp} /> / {p.levelXp.toLocaleString()} · {toNext} to {p.nextRank && p.nextRank.minLevel === p.level + 1 ? p.nextRank.name : `level ${p.level + 1}`}
          </span>
        </div>
        <div className="xp-track">
          <motion.div className="xp-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
          {tactical && Array.from({ length: 9 }, (_, i) => <i key={i} style={{ left: `${(i + 1) * 10}%` }} />)}
        </div>
      </div>
      <div className="hud-stats">
        <div className="hud-statbox streak"><Flame /><div><b className="num-display"><Ticker value={p.streak.current} /></b><span>day {L.streak.toLowerCase()} · best {p.streak.best}</span></div></div>
        <div className="hud-statbox coins"><Coins /><div><b className="num-display"><Ticker value={p.coins} /></b><span>{L.coins.toLowerCase()}</span></div></div>
        {hud.boost && hud.boost.until > Date.now() && (
          <div className="hud-statbox boost"><Zap /><div><b className="num-display">×{hud.boost.multiplier}</b><span>XP boost · {ago(hud.boost.until).replace('in ', '')} left</span></div></div>
        )}
        <Link href="/armory" className={cx('hud-statbox crates', p.unopenedCrates > 0 && 'has')}>
          <Package />
          <div><b className="num-display">{p.unopenedCrates}</b><span>{p.unopenedCrates ? `${L.crates.toLowerCase()} ready` : L.crates.toLowerCase()}</span></div>
        </Link>
      </div>
    </section>
  );
}

function ProgressTile({ label, prog, big, color, sub }: { label: string; prog: MissionProgress; big?: boolean; color: string; sub?: string }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const size = big ? 132 : 84;
  return (
    <div className={cx('prog-tile', big && 'big')}>
      <Ring pct={prog.pct} size={size} stroke={big ? 10 : 7} color={color} segments={tactical ? (big ? 24 : 16) : undefined} glow={tactical}>
        <span className="num-display ring-pct"><Ticker value={prog.pct} />%</span>
        {big && <span className="ring-sub">{prog.done}/{prog.total}</span>}
      </Ring>
      <div className="prog-meta">
        <div className="eyebrow">{label}</div>
        {!big && <div className="num faint" style={{ fontSize: 12 }}>{prog.done}/{prog.total} done</div>}
        {big && <div className="prog-big-line">{prog.pending ? `${prog.pending} pending` : 'All clear'}</div>}
        {prog.overdue > 0 && <span className="chip tone-danger" style={{ marginTop: 4 }}>{prog.overdue} {L.overdue.toLowerCase()}</span>}
        {sub && <div className="faint" style={{ fontSize: 12 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Mission progress deck: Today (big), Week, Squad + per-operation bars. */
export function ProgressDeck({ hud }: { hud: Hud }) {
  const L = useLabels();
  return (
    <section className="panel progress-deck" aria-label="Progress">
      <div className="panel-head"><h2>{L.tasks} progress</h2></div>
      <div className="prog-tiles">
        <ProgressTile big label={L.progressToday} prog={hud.today} color="var(--accent)" />
        <div className="prog-side">
          <ProgressTile label={L.progressWeek} prog={hud.week} color="var(--xp)" />
          <ProgressTile label={L.progressSquad} prog={hud.squadToday} color="var(--success)" />
        </div>
      </div>
      {hud.operations.length > 0 && (
        <div className="ops-bars">
          {hud.operations.map((o) => (
            <Link key={o.projectId} href={`/projects/${o.projectId}`} className="ops-bar">
              <span className="ops-emoji" style={{ background: `color-mix(in srgb, ${o.color} 18%, transparent)` }}>{o.emoji}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="truncate" style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</span>
                  <span className="num faint" style={{ fontSize: 12 }}>{o.progress.pct}%</span>
                </span>
                <Bar pct={o.progress.pct} color={o.color} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function Challenges({ challenges }: { challenges: DailyChallenge[] }) {
  const L = useLabels();
  return (
    <section className="panel" aria-label={L.challenges}>
      <div className="panel-head"><h2>{L.challenges}</h2><span className="spacer" /><span className="faint num" style={{ fontSize: 12 }}>{challenges.filter((c) => c.completedAt).length}/{challenges.length}</span></div>
      <ul className="challenge-list">
        {challenges.map((c) => {
          const done = !!c.completedAt;
          return (
            <li key={c.id} className={cx('challenge', done && 'done')}>
              <span className="challenge-check" aria-hidden>{done ? <Check /> : <span className="num">{c.progress}/{c.target}</span>}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span className="challenge-title truncate">{c.title}</span>
                  <span className="xp-pill">+{c.xp} XP</span>
                </div>
                <Bar pct={(c.progress / c.target) * 100} color={done ? 'var(--success)' : 'var(--xp)'} height={4} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FeedRow({ f, m }: { f: FeedItem; m: Member | undefined }) {
  const fresh = useFlash(f.id);
  const first = firstName(m?.name);
  return (
    <motion.li className={cx('feed-item', fresh && 'flash')} data-feed-id={f.id} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
      <Avatar member={m} size={24} />
      <span className="grow feed-text">{first && f.text.startsWith(first) ? <><b>{first}</b>{f.text.slice(first.length)}</> : f.text}</span>
      {f.xp > 0 && <span className="xp-pill">+{f.xp}</span>}
      <span className="faint feed-time">{ago(f.at)}</span>
    </motion.li>
  );
}

export function SquadFeed({ limit = 8 }: { limit?: number }) {
  const L = useLabels();
  const members = useMemberMap();
  const { data } = useQuery({ queryKey: qk.game.feed, queryFn: () => api.game.feed(30) });
  return (
    <section className="panel" aria-label={L.feed}>
      <div className="panel-head"><h2>{L.feed}</h2><span className="spacer" /><span className="live-dot" title="Live" /></div>
      <ul className="feed-list">
        {!data && Array.from({ length: 4 }, (_, i) => <li key={i} className="feed-item"><Skeleton w={24} h={24} r={12} /><Skeleton w="70%" /></li>)}
        <AnimatePresence initial={false}>
          {data?.slice(0, limit).map((f) => <FeedRow key={f.id} f={f} m={members.get(f.memberId)} />)}
        </AnimatePresence>
        {data && data.length === 0 && <li className="faint" style={{ padding: '8px 20px 16px', fontSize: 13 }}>Quiet on the comms. Complete a {L.taskLower} to light this up.</li>}
      </ul>
    </section>
  );
}
