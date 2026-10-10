import { AnimatePresence, m } from 'motion/react';
import { ArrowRight, Bot, CalendarClock, Hourglass, MapPin, Video } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'wouter';
import type { Briefing, Meeting, Member, TaskView, TeamPulse } from '@companybrain/types';
import { useBriefing, useHud, useMe, useMemberMap, useProjectMap } from '../api/queries';
import { Avatar, AvatarStack } from '../components/Avatar';
import { ProviderMark } from '../components/icons';
import { Empty, ErrorState, Skeleton, SkeletonRows, Ticker } from '../components/ui';
import { BriefingPlayer } from '../features/briefing/BriefingPlayer';
import { Challenges, HudHero, ProgressDeck, SquadFeed } from '../features/game/Hud';
import { QuickAdd } from '../features/tasks/QuickAdd';
import { useCompletionToggle } from '../features/tasks/TaskList';
import { TaskRow } from '../features/tasks/TaskRow';
import { useLabels } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { ago, fmtDuration, fmtLongDate, fmtTime } from '../lib/time';
import { ui } from '../lib/ui';
import { cx, firstName, plural } from '../lib/util';

export function Today() {
  const me = useMe();
  const { data: b, error, refetch } = useBriefing();
  const { data: hud } = useHud();
  const { tactical } = useTheme();
  const L = useLabels();
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const isMgr = ['owner', 'admin', 'manager'].includes(me.role);
  return (
    <div className="today">
      <div className="today-main">
        <Hero b={b} me={me} />
        <QuickAdd />
        {!b ? <div className="panel"><SkeletonRows n={6} /></div> : <MyDay b={b} />}
      </div>
      <aside className="today-side" aria-label="Status">
        {hud ? (
          <>
            {tactical && <HudHero hud={hud} />}
            <ProgressDeck hud={hud} />
            {tactical && <Challenges challenges={hud.challenges} />}
          </>
        ) : <div className="panel panel-pad"><Skeleton h={120} /></div>}
        {b && isMgr && b.team.length > 0 && <TeamPulsePanel team={b.team} />}
        {b && b.agents.length > 0 && <AgentsPanel agents={b.agents} />}
        <SquadFeed limit={tactical ? 7 : 5} />
        {!tactical && hud && <Challenges challenges={hud.challenges} />}
        {!tactical && hud && <HudHero hud={hud} />}
        {!isMgr && <div className="faint" style={{ fontSize: 12, textAlign: 'center' }}>{L.brandTag}</div>}
      </aside>
    </div>
  );
}

function Hero({ b, me }: { b: Briefing | undefined; me: Member }) {
  const { tactical } = useTheme();
  const L = useLabels();
  return (
    <section className={cx('hero panel', tactical && 'hero-tac')}>
      <div className="hero-top">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="eyebrow hero-kicker">{tactical ? `${L.todayTitle} · ${fmtLongDate(Date.now())}` : fmtLongDate(Date.now())}</div>
          {b ? (
            <m.h1 className="hero-greeting display" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
              {b.greeting.replace(/,\s*/, ', ')}
            </m.h1>
          ) : <Skeleton w="60%" h={34} />}
          {b ? <p className="hero-headline">{b.headline}</p> : <Skeleton w="40%" h={16} style={{ marginTop: 10 }} />}
        </div>
        {b && (
          <div className="hero-stats">
            <Stat n={b.myTasks.overdue.length} label={L.overdue} tone={b.myTasks.overdue.length ? 'danger' : undefined} />
            <Stat n={b.myTasks.today.length} label="Today" />
            <Stat n={b.meetings.length} label={L.meetings} />
            {b.inboxNew > 0 && <Link href="/inbox"><Stat n={b.inboxNew} label={L.inbox} tone="accent" /></Link>}
          </div>
        )}
      </div>
      {b && <BriefingPlayer briefing={b} me={me} />}
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'danger' | 'accent' }) {
  return (
    <div className={cx('hero-stat', tone && `tone-${tone}`)}>
      <b className="num-display"><Ticker value={n} /></b>
      <span>{label}</span>
    </div>
  );
}

type TimelineItem = { kind: 'task'; at: number; task: TaskView } | { kind: 'meeting'; at: number; meeting: Meeting };

function MyDay({ b }: { b: Briefing }) {
  const L = useLabels();
  const members = useMemberMap();
  const projects = useProjectMap();
  const { toggle, lingering } = useCompletionToggle();
  const open = (t: TaskView) => ui.openTask(t.id);
  const overdue = b.myTasks.overdue.filter((t) => t.status !== 'done' || lingering.has(t.id));
  const todayTasks = b.myTasks.today.filter((t) => t.status !== 'done' || lingering.has(t.id));
  const allDay = todayTasks.filter((t) => t.dueAllDay);
  const items = useMemo<TimelineItem[]>(() => [
    ...todayTasks.filter((t) => !t.dueAllDay && t.dueAt).map((t) => ({ kind: 'task' as const, at: t.dueAt!, task: t })),
    ...b.meetings.filter((m) => !m.allDay).map((m) => ({ kind: 'meeting' as const, at: m.startAt, meeting: m })),
  ].sort((a, c) => a.at - c.at), [todayTasks, b.meetings]);
  const nowIdx = items.findIndex((i) => i.at > Date.now());
  const row = (t: TaskView) => (
    <TaskRow key={t.id} task={t} members={members} project={t.projectId ? projects.get(t.projectId) : undefined} onOpen={open} onToggle={toggle} />
  );
  const nothing = !overdue.length && !todayTasks.length && !b.meetings.length;

  return (
    <>
      <AnimatePresence initial={false}>
        {overdue.length > 0 && (
          <m.section key="overdue" className="panel day-section critical" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
            <div className="panel-head"><span className="g-dot pulse" /><h2 style={{ color: 'var(--danger)' }}>{L.overdue}</h2><span className="faint num">{overdue.length}</span></div>
            <div className="task-list" role="list"><AnimatePresence initial={false}>{overdue.map(row)}</AnimatePresence></div>
          </m.section>
        )}
      </AnimatePresence>

      <section className="panel day-section">
        <div className="panel-head"><h2>Today</h2><span className="faint num">{todayTasks.length} {L.tasksLower} · {plural(b.meetings.length, L.meeting.toLowerCase())}</span></div>
        {nothing ? (
          <Empty art={L.today === 'HQ' ? '🛰️' : '🌤️'} title={L.today === 'HQ' ? 'Clear skies, operator' : 'A clear day'} action={<button className="btn btn-sm" onClick={() => ui.quickAdd()}>{L.newTask}</button>}>{L.emptyToday}</Empty>
        ) : (
          <>
            {allDay.length > 0 && (
              <>
                <div className="tl-anytime eyebrow">Anytime today</div>
                <div className="task-list" role="list"><AnimatePresence initial={false}>{allDay.map(row)}</AnimatePresence></div>
              </>
            )}
            <ol className="day-timeline">
              {items.map((it, i) => (
                <li key={it.kind === 'task' ? it.task.id : it.meeting.id} className={cx('dt-item', it.at < Date.now() && 'past')}>
                  {i === nowIdx && <div className="now-line" aria-label="Now"><span>{fmtTime(Date.now())}</span></div>}
                  <span className="dt-time num">{fmtTime(it.at)}</span>
                  <span className={cx('dt-dot', it.kind)} aria-hidden />
                  <div className="dt-body">
                    {it.kind === 'task' ? row(it.task) : <MeetingBlock m={it.meeting} members={members} />}
                  </div>
                </li>
              ))}
              {nowIdx === -1 && items.length > 0 && <li className="dt-item"><div className="now-line"><span>{fmtTime(Date.now())}</span></div></li>}
            </ol>
          </>
        )}
      </section>

      {b.waitingOn.length > 0 && (
        <section className="panel day-section">
          <div className="panel-head"><Hourglass size={16} style={{ color: 'var(--warning)' }} /><h2>{L.waiting}</h2><span className="faint num">{b.waitingOn.length}</span></div>
          <div className="task-list" role="list">{b.waitingOn.map(row)}</div>
        </section>
      )}

      {b.myTasks.upcoming.length > 0 && (
        <section className="panel day-section">
          <div className="panel-head"><h2>{L.upcoming}</h2><span className="spacer" /><Link href="/tasks" className="link" style={{ fontSize: 13 }}>All {L.tasksLower} <ArrowRight size={13} style={{ display: 'inline', verticalAlign: -2 }} /></Link></div>
          <div className="task-list" role="list">{b.myTasks.upcoming.slice(0, 6).map(row)}</div>
        </section>
      )}
    </>
  );
}

function MeetingBlock({ m, members }: { m: Meeting; members: Map<string, Member> }) {
  const live = m.startAt <= Date.now() && m.endAt > Date.now();
  return (
    <div className={cx('meeting-block', live && 'live')}>
      <CalendarClock size={16} className="mb-icon" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="mb-title truncate">{m.title}</div>
        <div className="mb-meta">
          {fmtTime(m.startAt)}–{fmtTime(m.endAt)} · {fmtDuration(m.endAt - m.startAt)}
          {m.location && <> · <MapPin size={12} /> {m.location}</>}
          {live && <span className="chip tone-success" style={{ height: 18, marginLeft: 6 }}>Now</span>}
        </div>
      </div>
      <AvatarStack members={m.attendeeIds.map((id) => members.get(id))} size={22} max={4} />
      {m.url && <a className="btn btn-sm" href={m.url} target="_blank" rel="noopener noreferrer"><Video /> Join</a>}
    </div>
  );
}

function TeamPulsePanel({ team }: { team: TeamPulse[] }) {
  const L = useLabels();
  const max = Math.max(1, ...team.map((t) => t.open + t.doneToday));
  return (
    <section className="panel" aria-label={L.teamPulse}>
      <div className="panel-head"><h2>{L.teamPulse}</h2><span className="spacer" /><Link href="/team" className="link" style={{ fontSize: 12.5 }}>{L.team}</Link></div>
      <ul className="pulse-list">
        {team.map((p) => (
          <li key={p.member.id}>
            <Link href={`/team/${p.member.id}`} className="pulse-row">
              <Avatar member={p.member} size={28} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="truncate" style={{ fontWeight: 600, fontSize: 13 }}>{firstName(p.member.name)}</span>
                  <span className="pulse-nums num">
                    {p.overdue > 0 && <span style={{ color: 'var(--danger)' }}>{p.overdue} late</span>}
                    <span>{p.open} open</span>
                    <span style={{ color: 'var(--success)' }}>✓{p.doneToday}</span>
                  </span>
                </div>
                <div className="pulse-bar" aria-hidden>
                  <m.i className="ov" initial={{ width: 0 }} animate={{ width: `${(p.overdue / max) * 100}%` }} transition={{ duration: 0.8 }} />
                  <m.i className="op" initial={{ width: 0 }} animate={{ width: `${((p.open - p.overdue) / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.05 }} />
                  <m.i className="dn" initial={{ width: 0 }} animate={{ width: `${(p.doneToday / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AgentsPanel({ agents }: { agents: Briefing['agents'] }) {
  const L = useLabels();
  return (
    <section className="panel" aria-label={L.agents}>
      <div className="panel-head"><Bot size={16} /><h2>{L.agents}</h2></div>
      <ul className="agent-list">
        {agents.map(({ member, inProgress, stale }) => {
          const quiet = stale.length > 0;
          return (
            <li key={member.id}>
              <Link href={`/team/${member.id}`} className={cx('agent-row', quiet && 'quiet')}>
                <span className="agent-avatar" style={{ background: member.color }}>
                  {member.agent && <ProviderMark provider={member.agent.provider} size={18} />}
                  {quiet && <span className="stale-pulse" />}
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b style={{ fontSize: 13 }}>{member.name}</b>
                    <span className="faint" style={{ fontSize: 11.5 }}>{member.agent?.lastSeenAt ? `seen ${ago(member.agent.lastSeenAt)}` : 'never connected'}</span>
                  </div>
                  <div className="agent-doing truncate">
                    {quiet ? <span style={{ color: 'var(--warning)' }}>Quiet on “{stale[0]!.title}”</span>
                      : inProgress[0] ? <>Working on “{inProgress[0].title}”</> : <span className="faint">Idle — ready for {L.tasksLower}</span>}
                  </div>
                </div>
                {inProgress.length > 1 && <span className="badge badge-soft">{inProgress.length}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
