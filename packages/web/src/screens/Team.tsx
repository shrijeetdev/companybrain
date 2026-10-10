import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Bot, Mail, Phone, Settings2, TriangleAlert, UserPlus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'wouter';
import type { LeaderboardEntry, Member, TaskView } from '@companybrain/types';
import { api } from '../api/endpoints';
import { qk, useMe, useMembers, useTasks } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { ProviderMark, PROVIDERS } from '../components/icons';
import { Empty, Skeleton, SkeletonRows, Ticker } from '../components/ui';
import { Insignia } from '../features/game/Insignia';
import { TaskList } from '../features/tasks/TaskList';
import { useLabels } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { ago, startOfDay, DAY } from '../lib/time';
import { cx } from '../lib/util';

interface Load { open: number; overdue: number; inProgress: TaskView[]; stale: number; doneWeek: number }

function useWorkload(): Map<string, Load> {
  const { data } = useTasks({ includeDone: true });
  return useMemo(() => {
    const m = new Map<string, Load>();
    const weekAgo = startOfDay(Date.now()) - 6 * DAY;
    for (const t of data ?? []) {
      for (const a of t.assigneeIds) {
        const l = m.get(a) ?? { open: 0, overdue: 0, inProgress: [], stale: 0, doneWeek: 0 };
        if (t.status === 'done') { if ((t.completedAt ?? 0) >= weekAgo) l.doneWeek++; }
        else if (t.status !== 'cancelled') {
          l.open++;
          if (t.isOverdue) l.overdue++;
          if (t.status === 'in_progress' || t.status === 'review') l.inProgress.push(t);
          if (t.isStale) l.stale++;
        }
        m.set(a, l);
      }
    }
    return m;
  }, [data]);
}

function useRanks(): Map<string, LeaderboardEntry> {
  const { data } = useQuery({ queryKey: qk.game.leaderboard('all'), queryFn: () => api.game.leaderboard('all'), staleTime: 60_000 });
  return useMemo(() => new Map([...(data?.humans ?? []), ...(data?.agents ?? [])].map((e) => [e.member.id, e])), [data]);
}

export function Team({ id }: { id?: string }) {
  if (id) return <Person id={id} />;
  return <TeamDirectory />;
}

function TeamDirectory() {
  const L = useLabels();
  const me = useMe();
  const { data: members, isLoading } = useMembers();
  const load = useWorkload();
  const ranks = useRanks();
  const humans = (members ?? []).filter((m) => m.kind === 'human');
  const agents = (members ?? []).filter((m) => m.kind === 'agent');
  const isAdmin = me.role === 'owner' || me.role === 'admin';
  const max = Math.max(4, ...[...load.values()].map((l) => l.open));
  return (
    <>
      <div className="page-head">
        <div><h1>{L.team}</h1><div className="sub">{humans.length} {L.humans.toLowerCase()} · {agents.length} {L.agents}</div></div>
        <div className="actions">
          {(isAdmin || me.role === 'manager') && <Link href="/settings/ai" className="btn"><Bot /> Add {L.agent}</Link>}
          {isAdmin && <Link href="/settings/team" className="btn btn-primary"><UserPlus /> Invite</Link>}
        </div>
      </div>
      <div className="section-title" style={{ margin: '4px 4px 10px' }}>{L.humans}</div>
      <div className="grid-cards">
        {isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} className="panel panel-pad"><Skeleton h={90} /></div>)}
        {humans.map((m, i) => <MemberCard key={m.id} m={m} i={i} l={load.get(m.id)} r={ranks.get(m.id)} max={max} />)}
      </div>
      <div className="section-title" style={{ margin: '26px 4px 10px' }}><Bot size={14} /> {L.agents}</div>
      <div className="grid-cards">
        {agents.map((m, i) => <AgentCard key={m.id} m={m} i={i} l={load.get(m.id)} r={ranks.get(m.id)} />)}
        {agents.length === 0 && <div className="panel" style={{ gridColumn: '1 / -1' }}><Empty art="🤖" title={`No ${L.agents} yet`} action={<Link href="/settings/ai" className="btn btn-primary">Connect Claude</Link>}>Give Claude, ChatGPT or Cursor a seat on the team — they get {L.tasksLower}, leave handoffs and can’t forget.</Empty></div>}
      </div>
    </>
  );
}

function MemberCard({ m, i, l, r, max }: { m: Member; i: number; l?: Load; r?: LeaderboardEntry; max: number }) {
  const { tactical } = useTheme();
  const L = useLabels();
  const open = l?.open ?? 0;
  const over = l?.overdue ?? 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
      <Link href={`/team/${m.id}`} className="panel member-card">
        <div className="row" style={{ gap: 12 }}>
          <Avatar member={m} size={44} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}><b className="truncate">{m.name}</b>{!m.active && <span className="chip">Inactive</span>}</div>
            <div className="faint truncate" style={{ fontSize: 12.5 }}>{m.title ?? m.role}</div>
          </div>
          {r && <div className="mc-rank" title={`${r.rank.name} · level ${r.level}`}><Insignia rank={r.rank} size={tactical ? 26 : 22} /><span className="num-display">{r.level}</span></div>}
        </div>
        <div className="workload" aria-label={`${open} open, ${over} ${L.overdue.toLowerCase()}`}>
          <div className="wl-bar"><i className="ov" style={{ width: `${(over / max) * 100}%` }} /><i className="op" style={{ width: `${((open - over) / max) * 100}%` }} /></div>
          <div className="wl-nums num"><span>{open} open</span>{over > 0 && <span style={{ color: 'var(--danger)' }}>{over} {L.overdue.toLowerCase()}</span>}<span style={{ color: 'var(--success)' }}>{l?.doneWeek ?? 0} done this week</span></div>
        </div>
        {l?.inProgress[0] && <div className="mc-focus truncate"><span className="eyebrow">Focus</span> {l.inProgress[0].title}</div>}
      </Link>
    </motion.div>
  );
}

function AgentCard({ m, i, l, r }: { m: Member; i: number; l?: Load; r?: LeaderboardEntry }) {
  const provider = PROVIDERS.find((p) => p.id === m.agent?.provider);
  const stale = (l?.stale ?? 0) > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
      <Link href={`/team/${m.id}`} className={cx('panel member-card agent', stale && 'quiet')}>
        <div className="row" style={{ gap: 12 }}>
          <span className="agent-avatar" style={{ background: m.color, width: 44, height: 44 }}>
            {m.agent && <ProviderMark provider={m.agent.provider} size={22} />}
            {stale && <span className="stale-pulse" />}
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}><b>{m.name}</b><span className="chip tone-info" style={{ height: 20 }}>{provider?.name ?? 'Agent'}</span></div>
            <div className="faint truncate" style={{ fontSize: 12.5 }}>{m.agent?.description || m.title}</div>
          </div>
          {r && <div className="mc-rank"><Insignia rank={r.rank} size={22} /><span className="num-display">{r.level}</span></div>}
        </div>
        <div className="agent-meta">
          <span className={cx('live-dot', (!m.agent?.lastSeenAt || Date.now() - m.agent.lastSeenAt > 3600_000) && 'off')} />
          <span>{m.agent?.lastSeenAt ? `Seen ${ago(m.agent.lastSeenAt)}` : 'Never connected'}</span>
          <span>·</span><span>{l?.open ?? 0} open</span>
          {stale && <span style={{ color: 'var(--warning)', fontWeight: 600 }}><TriangleAlert size={12} style={{ display: 'inline', verticalAlign: -1 }} /> {l!.stale} stale</span>}
        </div>
        {l?.inProgress[0] && <div className="mc-focus truncate"><span className="eyebrow">Working on</span> {l.inProgress[0].title}</div>}
      </Link>
    </motion.div>
  );
}

function Person({ id }: { id: string }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const me = useMe();
  const { data: members } = useMembers();
  const m = members?.find((x) => x.id === id);
  const { data: tasks, isLoading } = useTasks({ assigneeId: id, includeDone: true });
  const { data: profile } = useQuery({ queryKey: qk.game.profile(id), queryFn: () => api.game.profile(id), staleTime: 30_000 });
  const supervisor = m?.agent?.supervisorId ? members?.find((x) => x.id === m.agent!.supervisorId) : null;
  if (!m) return <div className="panel panel-pad"><Skeleton h={100} /></div>;
  const open = (tasks ?? []).filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.isOverdue).length;
  const doneWeek = (tasks ?? []).filter((t) => t.status === 'done' && (t.completedAt ?? 0) > Date.now() - 7 * DAY).length;
  const focus = open.filter((t) => t.status === 'in_progress' || t.status === 'review');
  const stale = open.filter((t) => t.isStale);
  return (
    <>
      <div className="panel person-hero">
        {m.kind === 'agent' ? (
          <span className="agent-avatar" style={{ background: m.color, width: 72, height: 72 }}>{m.agent && <ProviderMark provider={m.agent.provider} size={34} />}</span>
        ) : <Avatar member={m} size={72} frame={profile?.equipped.frame} />}
        <div className="grow" style={{ minWidth: 0 }}>
          {profile?.equipped.title && <div className="hud-title">{profile.equipped.title}</div>}
          <h1 className="display" style={{ fontSize: 26 }}>{m.name}</h1>
          <div className="muted" style={{ fontSize: 14 }}>{m.title ?? m.role}{m.kind === 'agent' && supervisor ? ` · supervised by ${supervisor.name}` : ''}</div>
          <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }} >
            {profile && <span className="row" style={{ gap: 6 }}><Insignia rank={profile.rank} size={20} glow={tactical} /><b>{profile.rank.name}</b> · {L.level} {profile.level}</span>}
            {m.email && <a className="link row" style={{ gap: 4 }} href={`mailto:${m.email}`}><Mail size={13} />{m.email}</a>}
            {m.phone && <span className="faint row" style={{ gap: 4 }}><Phone size={13} />{m.phone}</span>}
            {m.kind === 'agent' && <span className="faint">{m.agent?.lastSeenAt ? `Last seen ${ago(m.agent.lastSeenAt)}` : 'Never connected'}</span>}
          </div>
        </div>
        {(me.role === 'owner' || me.role === 'admin' || (m.kind === 'agent' && me.role === 'manager')) && (
          <Link href={m.kind === 'agent' ? '/settings/ai' : '/settings/team'} className="btn btn-sm"><Settings2 /> Manage</Link>
        )}
      </div>
      <div className="stat-cards" style={{ marginTop: 14 }}>
        <div className="panel stat-card"><div className="eyebrow">Open</div><b className="num-display"><Ticker value={open.length} /></b></div>
        <div className="panel stat-card"><div className="eyebrow">{L.overdue}</div><b className="num-display" style={{ color: overdue ? 'var(--danger)' : undefined }}><Ticker value={overdue} /></b></div>
        <div className="panel stat-card"><div className="eyebrow">Done this week</div><b className="num-display" style={{ color: 'var(--success)' }}><Ticker value={doneWeek} /></b></div>
        {profile && <div className="panel stat-card"><div className="eyebrow">{L.streak}</div><b className="num-display"><Ticker value={profile.streak.current} /> <span style={{ fontSize: 14 }}>🔥</span></b></div>}
      </div>
      {stale.length > 0 && (
        <div className="panel panel-pad" style={{ marginBottom: 14, borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }}>
          <div className="row" style={{ gap: 8, color: 'var(--warning)', fontWeight: 650 }}><TriangleAlert size={16} /> {stale.length} {stale.length === 1 ? L.taskLower : L.tasksLower} without activity for a while</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>The agent will be nudged; the supervisor gets escalations. Leave a comment to unblock it.</div>
        </div>
      )}
      {focus.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head"><h2>Current focus</h2></div>
          <div style={{ paddingBottom: 6 }}><TaskList tasks={focus} grouped={false} /></div>
        </div>
      )}
      <div className="panel" style={{ padding: '6px 0' }}>
        {isLoading ? <SkeletonRows /> : <TaskList tasks={tasks ?? []} emptyState={<Empty art="🌤️" title={`No open ${L.tasksLower}`}>Nothing assigned right now.</Empty>} />}
      </div>
    </>
  );
}
