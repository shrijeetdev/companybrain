import { m, useReducedMotion } from 'motion/react';
import { Check, Clock3, Hourglass, ListChecks, MessageSquare, Repeat, TriangleAlert } from 'lucide-react';
import { memo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { Member, ProjectSummary, TaskView } from '@companybrain/types';
import { useFlash } from '../../api/queries';
import { AvatarStack } from '../../components/Avatar';
import { ChannelIcon, PriorityIcon } from '../../components/icons';
import { useLabels } from '../../lib/labels';
import { fmtDue } from '../../lib/time';
import { cx } from '../../lib/util';

export function DueLabel({ task }: { task: TaskView }) {
  const L = useLabels();
  if (!task.dueAt) return null;
  const cls = task.status === 'done' ? '' : task.isOverdue ? 'due-overdue' : task.isDueToday ? 'due-today' : '';
  return (
    <span className={cls} title={task.isOverdue ? L.overdue : undefined}>
      <Clock3 />
      {fmtDue(task.dueAt, task.dueAllDay)}
    </span>
  );
}

export function CheckButton({ task, onToggle, label }: { task: TaskView; onToggle: (el: HTMLElement) => void; label?: string }) {
  const done = task.status === 'done';
  const reduce = useReducedMotion();
  return (
    <m.button
      type="button"
      className={cx('check', done && 'is-done')}
      data-priority={task.priority}
      aria-label={label ?? (done ? `Reopen “${task.title}”` : `Complete “${task.title}”`)}
      aria-pressed={done}
      onClick={(e) => { e.stopPropagation(); onToggle(e.currentTarget); }}
      whileTap={reduce ? undefined : { scale: 0.8 }}
    >
      {done ? (
        <m.span initial={reduce ? false : { scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 700, damping: 18 }} style={{ display: 'grid' }}>
          <Check />
        </m.span>
      ) : <Check style={{ opacity: 0 }} />}
    </m.button>
  );
}

interface RowProps {
  task: TaskView;
  members: Map<string, Member>;
  project?: ProjectSummary;
  onOpen: (t: TaskView) => void;
  onToggle: (t: TaskView, el: HTMLElement) => void;
  selected?: boolean;
  selecting?: boolean;
  onSelect?: (t: TaskView, e: MouseEvent | KeyboardEvent) => void;
  showProject?: boolean;
}

export const TaskRow = memo(function TaskRow({ task, members, project, onOpen, onToggle, selected, selecting, onSelect, showProject = true }: RowProps) {
  const flash = useFlash(task.id);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const done = task.status === 'done';
  const assignees = task.assigneeIds.map((id) => members.get(id));
  const subDone = task.subtasks.filter((s) => s.done).length;
  const agentAssigned = assignees.some((m) => m?.kind === 'agent');
  return (
    <m.div
      ref={ref}
      layout={reduce ? false : 'position'}
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className={cx('task-row', done && 'is-done', task.isOverdue && 'is-overdue', selected && 'selected', flash && 'flash')}
      role="listitem"
      tabIndex={0}
      aria-label={task.title}
      data-task-id={task.id}
      onClick={(e) => {
        if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) { onSelect?.(task, e); return; }
        onOpen(task);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') { e.preventDefault(); onOpen(task); }
        else if (e.key === ' ') { e.preventDefault(); onToggle(task, ref.current?.querySelector('.check') ?? ref.current!); }
        else if (e.key === 'x') { e.preventDefault(); onSelect?.(task, e); }
        else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); (ref.current?.nextElementSibling as HTMLElement | null)?.focus(); }
        else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); (ref.current?.previousElementSibling as HTMLElement | null)?.focus(); }
      }}
    >
      {selecting && (
        <button className={cx('check check-sq sel-box', selected && 'is-done')} aria-label={selected ? 'Deselect' : 'Select'} onClick={(e) => { e.stopPropagation(); onSelect?.(task, e); }}>
          <Check style={{ opacity: selected ? 1 : 0 }} />
        </button>
      )}
      <CheckButton task={task} onToggle={(el) => onToggle(task, el)} />
      <div className="task-main">
        <div className="task-title-line">
          <span className="task-title">
            {task.title}
            {done && <m.span className="strike" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} />}
          </span>
        </div>
        <div className="task-meta">
          <DueLabel task={task} />
          {task.recurrence && <span title="Repeats"><Repeat /></span>}
          {task.waitingOn && <span style={{ color: 'var(--warning)' }}><Hourglass />{task.waitingOn.name.split(' · ')[0]}</span>}
          {task.subtasks.length > 0 && <span><ListChecks />{subDone}/{task.subtasks.length}</span>}
          {task.commentCount > 0 && <span className="hide-mobile"><MessageSquare />{task.commentCount}</span>}
          {task.isStale && agentAssigned && <span className="stale"><TriangleAlert />Agent quiet</span>}
          {showProject && project && (
            <span className="proj-chip"><span className="pc-dot" style={{ background: project.color }} /><span className="truncate">{project.name}</span></span>
          )}
          {task.tags.slice(0, 2).map((t) => <span key={t} className="faint">#{t}</span>)}
          {task.source.channel !== 'manual' && task.source.channel !== 'quick_add' && task.source.channel !== 'recurring' && (
            <span title={`Source: ${task.source.channel}`}><ChannelIcon channel={task.source.channel} size={12} /></span>
          )}
        </div>
      </div>
      <div className="task-right">
        {task.priority !== 'none' && <span className="hide-mobile" title={`${task.priority} priority`}><PriorityIcon priority={task.priority} /></span>}
        {task.priority === 'urgent' && <span className="only-mobile"><PriorityIcon priority="urgent" /></span>}
        <AvatarStack members={assignees} size={24} max={3} />
      </div>
    </m.div>
  );
});
