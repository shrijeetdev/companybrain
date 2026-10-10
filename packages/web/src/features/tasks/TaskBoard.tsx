import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Hourglass, ListChecks, MessageSquare, Plus, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Member, ProjectSummary, TaskStatus, TaskView } from '@companybrain/types';
import { useFlash, useMemberMap, useProjectMap } from '../../api/queries';
import { AvatarStack } from '../../components/Avatar';
import { PriorityIcon, StatusIcon } from '../../components/icons';
import { Portal } from '../../components/Overlay';
import { STATUS_ORDER, statusLabel, useLabels } from '../../lib/labels';
import { useTheme } from '../../lib/theme';
import { ui } from '../../lib/ui';
import { cx } from '../../lib/util';
import { useTaskActions } from './actions';
import { DueLabel } from './TaskRow';

interface Placement { id: string; status: TaskStatus; index: number }
interface PointerDrag { id: string; dx: number; dy: number; x: number; y: number; w: number; h: number }

function CardBody({ task, members, project }: { task: TaskView; members: Map<string, Member>; project?: ProjectSummary }) {
  const sub = task.subtasks.filter((s) => s.done).length;
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <span className="card-title grow">{task.title}</span>
        {task.priority !== 'none' && <PriorityIcon priority={task.priority} />}
      </div>
      <div className="card-foot">
        {project && <span className="row" style={{ gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: project.color }} />{project.name}</span>}
        <DueLabel task={task} />
        {task.waitingOn && <span className="row" style={{ gap: 3, color: 'var(--warning)' }}><Hourglass />{task.waitingOn.name.split(' · ')[0]}</span>}
        {task.subtasks.length > 0 && <span className="row" style={{ gap: 3 }}><ListChecks />{sub}/{task.subtasks.length}</span>}
        {task.commentCount > 0 && <span className="row" style={{ gap: 3 }}><MessageSquare />{task.commentCount}</span>}
        {task.isStale && <span className="row" style={{ gap: 3, color: 'var(--warning)' }}><TriangleAlert />Quiet</span>}
        <span className="grow" />
        <AvatarStack members={task.assigneeIds.map((id) => members.get(id))} size={22} max={3} />
      </div>
    </>
  );
}

function BoardCard({ task, members, project, dragging, lifted, onPointerDown, onKeyDown }: {
  task: TaskView; members: Map<string, Member>; project?: ProjectSummary; dragging: boolean; lifted: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, t: TaskView) => void; onKeyDown: (e: React.KeyboardEvent, t: TaskView) => void;
}) {
  const flash = useFlash(task.id);
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={reduce ? false : true}
      layoutId={`card-${task.id}`}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className={cx('card', task.isOverdue && 'is-overdue', lifted && 'lifted', flash && 'flash')}
      style={{ opacity: dragging ? 0.35 : 1 }}
      tabIndex={0}
      role="listitem"
      aria-roledescription="Draggable card"
      aria-grabbed={lifted}
      aria-label={`${task.title}. Press space to pick up, arrows to move.`}
      data-card-id={task.id}
      onPointerDown={(e) => onPointerDown(e, task)}
      onKeyDown={(e) => onKeyDown(e, task)}
    >
      <CardBody task={task} members={members} project={project} />
    </motion.div>
  );
}

export function TaskBoard({ tasks, showProject = true }: { tasks: TaskView[]; showProject?: boolean }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const members = useMemberMap();
  const projects = useProjectMap();
  const { update, complete, reopen } = useTaskActions();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [pdrag, setPdrag] = useState<PointerDrag | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const colRefs = useRef(new Map<TaskStatus, HTMLDivElement>());
  const start = useRef<{ x: number; y: number; t: TaskView; el: HTMLElement; pointerId: number } | null>(null);

  const base = useMemo(() => {
    const m = new Map<TaskStatus, TaskView[]>(STATUS_ORDER.map((s) => [s, []]));
    for (const t of tasks) m.get(t.status === 'cancelled' ? 'done' : t.status)?.push(t);
    for (const [s, arr] of m) arr.sort(s === 'done' ? (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) : (a, b) => a.order - b.order);
    m.set('done', (m.get('done') ?? []).slice(0, 25));
    return m;
  }, [tasks]);

  // Columns with the dragged card moved to its preview placement (others slide via layout).
  const columns = useMemo(() => {
    if (!placement) return base;
    const m = new Map<TaskStatus, TaskView[]>();
    let moving: TaskView | undefined;
    for (const [s, arr] of base) {
      const f = arr.filter((t) => t.id !== placement.id);
      if (f.length !== arr.length) moving = arr.find((t) => t.id === placement.id);
      m.set(s, f);
    }
    if (moving) {
      const arr = m.get(placement.status)!;
      arr.splice(Math.min(placement.index, arr.length), 0, moving);
    }
    return m;
  }, [base, placement]);

  const commit = useCallback((p: Placement) => {
    const t = tasks.find((x) => x.id === p.id);
    if (!t) return;
    const col = (base.get(p.status) ?? []).filter((x) => x.id !== p.id);
    const prev = col[p.index - 1];
    const next = col[p.index];
    const order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1024 : next ? next.order - 1024 : 0;
    const el = document.querySelector(`[data-card-id="${p.id}"]`);
    if (p.status === 'done' && t.status !== 'done') void complete(t, el);
    else if (t.status === 'done' && p.status !== 'done') void reopen(t).then(() => update({ ...t, status: 'todo' }, { status: p.status, order }));
    else if (p.status !== t.status || order !== t.order) void update(t, p.status !== t.status ? { status: p.status, order } : { order });
    setAnnounce(`Moved to ${statusLabel(p.status, tactical)}`);
  }, [tasks, base, update, complete, reopen, tactical]);

  // ── Pointer drag ──
  const hitTest = useCallback((x: number, y: number, id: string): Placement | null => {
    for (const [status, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top - 40 || y > r.bottom + 40) continue;
      const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-card-id]')).filter((c) => c.dataset.cardId !== id);
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const cr = cards[i]!.getBoundingClientRect();
        if (y < cr.top + cr.height / 2) { index = i; break; }
      }
      return { id, status, index };
    }
    return null;
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (!pdrag) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
        const r = s.el.getBoundingClientRect();
        setPdrag({ id: s.t.id, dx: s.x - r.left, dy: s.y - r.top, x: e.clientX, y: e.clientY, w: r.width, h: r.height });
        return;
      }
      e.preventDefault();
      setPdrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const p = hitTest(e.clientX, e.clientY, s.t.id);
      if (p) setPlacement((cur) => (cur && cur.status === p.status && cur.index === p.index ? cur : p));
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      start.current = null;
      if (!pdrag) { ui.openTask(s.t.id); return; }
      const p = hitTest(e.clientX, e.clientY, s.t.id) ?? placement;
      setPdrag(null);
      setPlacement(null);
      if (p) commit(p);
    };
    const cancel = () => { start.current = null; setPdrag(null); setPlacement(null); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  }, [pdrag, placement, hitTest, commit]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, t: TaskView) => {
    if (e.button !== 0 || lifted) return;
    start.current = { x: e.clientX, y: e.clientY, t, el: e.currentTarget, pointerId: e.pointerId };
  };

  // ── Keyboard drag ──
  const onKeyDown = (e: React.KeyboardEvent, t: TaskView) => {
    const cur = placement && placement.id === t.id ? placement : null;
    if (!lifted) {
      if (e.key === ' ') { e.preventDefault(); const status = t.status === 'cancelled' ? 'done' : t.status; const idx = (base.get(status) ?? []).findIndex((x) => x.id === t.id); setLifted(t.id); setPlacement({ id: t.id, status, index: idx }); setAnnounce(`Picked up ${t.title}. Use arrow keys to move, space to drop, escape to cancel.`); }
      else if (e.key === 'Enter') { e.preventDefault(); ui.openTask(t.id); }
      return;
    }
    if (lifted !== t.id || !cur) return;
    const si = STATUS_ORDER.indexOf(cur.status);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const ns = STATUS_ORDER[Math.max(0, Math.min(STATUS_ORDER.length - 1, si + (e.key === 'ArrowRight' ? 1 : -1)))]!;
      const len = (base.get(ns) ?? []).filter((x) => x.id !== t.id).length;
      setPlacement({ ...cur, status: ns, index: Math.min(cur.index, len) });
      setAnnounce(statusLabel(ns, tactical));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const len = (base.get(cur.status) ?? []).filter((x) => x.id !== t.id).length;
      setPlacement({ ...cur, index: Math.max(0, Math.min(len, cur.index + (e.key === 'ArrowDown' ? 1 : -1))) });
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setLifted(null);
      setPlacement(null);
      commit(cur);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLifted(null);
      setPlacement(null);
      setAnnounce('Move cancelled');
    }
  };
  // keep focus on the lifted card as it moves between columns
  useEffect(() => {
    if (!lifted) return;
    const el = document.querySelector<HTMLElement>(`[data-card-id="${lifted}"]`);
    if (el && document.activeElement !== el) el.focus({ preventScroll: false });
  });

  const ghostTask = pdrag ? tasks.find((t) => t.id === pdrag.id) : undefined;
  const statusColor: Record<TaskStatus, string> = { todo: 'var(--text-3)', in_progress: 'var(--info)', blocked: 'var(--danger)', review: 'var(--violet)', done: 'var(--success)', cancelled: 'var(--text-3)' };

  return (
    <>
      <div className="board" role="group" aria-label="Board">
        {STATUS_ORDER.map((s) => {
          const list = columns.get(s) ?? [];
          const isTarget = !!placement && placement.status === s && (pdrag || lifted);
          return (
            <section key={s} className={cx('board-col panel', isTarget && 'drop-target')} aria-label={statusLabel(s, tactical)}>
              <div className="board-col-head">
                <StatusIcon status={s} />
                <span style={{ color: s === 'blocked' ? statusColor[s] : undefined }}>{statusLabel(s, tactical)}</span>
                <span className="faint num">{(base.get(s) ?? []).length}</span>
                <span className="grow" />
                {s !== 'done' && (
                  <button className="icon-btn icon-btn-sm" aria-label={`Add to ${statusLabel(s, tactical)}`} onClick={() => ui.quickAdd(true, { status: s })}><Plus /></button>
                )}
              </div>
              <div className="board-col-body" role="list" ref={(el) => { if (el) colRefs.current.set(s, el); else colRefs.current.delete(s); }}>
                <AnimatePresence initial={false}>
                  {list.map((t) => (
                    <BoardCard key={t.id} task={t} members={members} project={showProject && t.projectId ? projects.get(t.projectId) : undefined}
                      dragging={pdrag?.id === t.id} lifted={lifted === t.id} onPointerDown={onPointerDown} onKeyDown={onKeyDown} />
                  ))}
                </AnimatePresence>
                {list.length === 0 && <div className="board-empty">{s === 'done' ? `No ${L.tasksLower} completed yet` : 'Drop here'}</div>}
              </div>
            </section>
          );
        })}
      </div>
      <div className="sr-only" aria-live="assertive">{announce}</div>
      {pdrag && ghostTask && (
        <Portal>
          <div className="card card-ghost" style={{ left: pdrag.x - pdrag.dx, top: pdrag.y - pdrag.dy, width: pdrag.w, minHeight: pdrag.h }}>
            <CardBody task={ghostTask} members={members} project={showProject && ghostTask.projectId ? projects.get(ghostTask.projectId) : undefined} />
          </div>
        </Portal>
      )}
    </>
  );
}
