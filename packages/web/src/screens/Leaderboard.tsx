import { useQuery } from '@tanstack/react-query';
import { m } from 'motion/react';
import { Bot, Flame, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import type { Leaderboard as LB, LeaderboardEntry } from '@companybrain/types';
import { api } from '../api/endpoints';
import { qk, useMe } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { ProviderMark } from '../components/icons';
import { Segmented, SkeletonRows, Ticker } from '../components/ui';
import { Insignia } from '../features/game/Insignia';
import { useLabels } from '../lib/labels';
import { cx, firstName } from '../lib/util';

function Who({ e, size }: { e: LeaderboardEntry; size: number }) {
  if (e.member.kind === 'agent' && e.member.agent) {
    return <span className="agent-avatar" style={{ background: e.member.color, width: size, height: size }}><ProviderMark provider={e.member.agent.provider} size={size * 0.5} /></span>;
  }
  return <Avatar member={e.member} size={size} />;
}

export function Leaderboard() {
  const L = useLabels();
  const me = useMe();
  const [period, setPeriod] = useState<LB['period']>('week');
  const [side, setSide] = useState<'humans' | 'agents'>('humans');
  const { data, isLoading } = useQuery({ queryKey: qk.game.leaderboard(period), queryFn: () => api.game.leaderboard(period) });
  const list = data?.[side] ?? [];
  const podium = [list[1], list[0], list[2]];
  return (
    <>
      <div className="page-head">
        <div><h1>{L.leaderboard}</h1><div className="sub">XP earned by completing {L.tasksLower} on time. {L.agents} compete in their own league.</div></div>
        <div className="actions">
          <Segmented label="League" value={side} onChange={setSide} options={[{ value: 'humans', label: L.humans, icon: <Users /> }, { value: 'agents', label: 'AI', icon: <Bot /> }]} />
          <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }]} />
        </div>
      </div>
      {isLoading ? <div className="panel"><SkeletonRows /></div> : (
        <>
          <div className="podium">
            {podium.map((e, i) => e ? (
              <m.div key={`${side}-${period}-${e.member.id}`} className={cx('podium-slot', `p${e.position}`)} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: [0.15, 0, 0.3][i], type: 'spring', stiffness: 200, damping: 20 }}>
                <Who e={e} size={e.position === 1 ? 64 : 52} />
                <div className="podium-name">{firstName(e.member.name)}</div>
                <div className="row" style={{ gap: 4, fontSize: 12 }}><Insignia rank={e.rank} size={18} />{e.rank.name}</div>
                <div className="podium-xp num"><Ticker value={e.xp} /> XP</div>
                <div className="podium-block num-display">{e.position}</div>
              </m.div>
            ) : <div key={i} />)}
          </div>
          <div className="panel">
            <div className="lb-row faint" style={{ borderTop: 0, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650 }}>
              <span>#</span><span>{side === 'humans' ? 'Operator' : 'AI'}</span><span>XP</span><span className="hide-sm2">On time</span><span className="hide-sm2">Streak</span>
            </div>
            {list.map((e, i) => (
              <m.div key={e.member.id} className={cx('lb-row', e.member.id === me.id && 'me')} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <span className="lb-pos">{e.position}</span>
                <Link href={`/team/${e.member.id}`} className="row" style={{ gap: 10, minWidth: 0 }}>
                  <Who e={e} size={30} />
                  <span style={{ minWidth: 0 }}>
                    <b className="truncate" style={{ display: 'block' }}>{e.member.name}{e.member.id === me.id ? ' (you)' : ''}</b>
                    <span className="faint row" style={{ gap: 4, fontSize: 11.5 }}><Insignia rank={e.rank} size={14} />{e.rank.name} · {L.level} {e.level}</span>
                  </span>
                </Link>
                <span className="num" style={{ fontWeight: 700, color: 'var(--xp)' }}>{e.xp.toLocaleString()}</span>
                <span className="num hide-sm2">{Math.round(e.onTimeRate * 100)}%</span>
                <span className="num hide-sm2 row" style={{ gap: 3 }}><Flame size={13} style={{ color: 'var(--streak)' }} />{e.streak}</span>
              </m.div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
