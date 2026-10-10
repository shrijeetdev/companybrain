import { AnimatePresence, m, useReducedMotion } from 'motion/react';
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
interface PressStart {
  x: number; y: number; t: TaskView; el: HTMLElement; pointerId: number;
  /** Touch/pen: the card is only picked up after a long press (so a swipe still scrolls). */
  touch: boolean; timer: number;
}

/** Long-press to pick a card up on touch screens; moving beyond the slop before that = scrolling. */
const LONG_PRESS_MS = 380;
const TOUCH_SLOP = 8;
const MOUSE_SLOP = 6;
/** Auto-scroll when the dragged card is this close to an edge (px). */
const EDGE = 64;

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

function BoardCard({ task, members, project, dragging, lifted, onPointerDown, onKeyDown, onClick }: {
  task: TaskView; members: Map<string, Member>; project?: ProjectSummary; dragging: boolean; lifted: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, t: TaskView) => void; onKeyDown: (e: React.KeyboardEvent, t: TaskView) => void; onClick: (t: TaskView) => void;
}) {
  const flash = useFlash(task.id);
  const reduce = useReducedMotion();
  return (
    <m.div
      layout={reduce ? false : true}
      layoutId={`card-${task.id}`}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className={cx('card', task.isOverdue && 'is-overdue', lifted && 'lifted', flash && 'flash')}
      style={{ opacity: dragging ? 0.35 : 1 }}
      tabIndex={0}
      role="listitem"
      aria-roledescription="Draggable card"
      aria-grabbed={lifted}
      aria-label={`${task.title}. Press space to pick up, arrows to move. On touch screens, press and hold to drag.`}
      data-card-id={task.id}
      onPointerDown={(e) => onPointerDown(e, task)}
      onKeyDown={(e) => onKeyDown(e, task)}
      onClick={() => onClick(task)}
      onContextMenu={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') e.preventDefault(); }}
    >
      <CardBody task={task} members={members} project={project} />
    </m.div>
  );
}

export function TaskBoard({ tasks, showProject = true, doneWindow }: {
  tasks: TaskView[]; showProject?: boolean;
  /** The Done column only holds recent completions; `onToggle` switches to all of them (and back). */
  doneWindow?: { label: string; limited: boolean; onToggle: () => void };
}) {
  const L = useLabels();
  const { tactical } = useTheme();
  const reduce = useReducedMotion();
  const members = useMemberMap();
  const projects = useProjectMap();
  const { update, complete, reopen } = useTaskActions();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [pdrag, setPdrag] = useState<PointerDrag | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const colRefs = useRef(new Map<TaskStatus, HTMLDivElement>());
  const boardRef = useRef<HTMLDivElement>(null);
  const start = useRef<PressStart | null>(null);
  /** Mirrors of render state for event handlers / rAF (no stale closures). */
  const dragging = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const placementRef = useRef<Placement | null>(null);
  placementRef.current = placement;
  const origin = useRef<Placement | null>(null);
  /** The click that follows a drop must not open the card. */
  const suppressClickUntil = useRef(0);
  const onCardClick = useCallback((t: TaskView) => {
    if (performance.now() < suppressClickUntil.current || dragging.current) return;
    ui.openTask(t.id);
  }, []);

  const base = useMemo(() => {
    const m = new Map<TaskStatus, TaskView[]>(STATUS_ORDER.map((s) => [s, []]));
    for (const t of tasks) m.get(t.status === 'cancelled' ? 'done' : t.status)?.push(t);
    for (const [s, arr] of m) arr.sort(s === 'done' ? (a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt) : (a, b) => a.order - b.order);
    if (!doneWindow) m.set('done', (m.get('done') ?? []).slice(0, 25));
    return m;
  }, [tasks, doneWindow]);

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

  const placementOf = useCallback((t: TaskView): Placement => {
    const status = t.status === 'cancelled' ? 'done' : t.status;
    return { id: t.id, status, index: Math.max(0, (base.get(status) ?? []).findIndex((x) => x.id === t.id)) };
  }, [base]);

  const commit = useCallback((p: Placement) => {
    const t = tasks.find((x) => x.id === p.id);
    if (!t) return;
    const o = origin.current;
    if (o && o.id === p.id && o.status === p.status && o.index === p.index) { setAnnounce('Dropped in place'); return; }
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

  // ── Pointer drag (mouse: press + move; touch/pen: long-press, then move) ──
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

  const track = useCallback((x: number, y: number, id: string) => {
    const p = hitTest(x, y, id);
    if (p) setPlacement((cur) => (cur && cur.status === p.status && cur.index === p.index ? cur : p));
  }, [hitTest]);

  const beginDrag = useCallback((s: PressStart, x: number, y: number) => {
    const r = s.el.getBoundingClientRect();
    dragging.current = true;
    pointer.current = { x, y };
    origin.current = placementOf(s.t);
    setPlacement(origin.current);
    setPdrag({ id: s.t.id, dx: s.x - r.left, dy: s.y - r.top, x, y, w: r.width, h: r.height });
    if (s.touch) {
      try { navigator.vibrate?.(12); } catch { /* not supported */ }
      setAnnounce(`Picked up ${s.t.title}. Drag to another column and lift to drop.`);
    }
  }, [placementOf]);

  const endDrag = useCallback(() => {
    dragging.current = false;
    pointer.current = null;
    setPdrag(null);
    setPlacement(null);
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (!dragging.current) {
        const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
        if (s.touch) {
          // Moved before the long press fired: it's a scroll/swipe, not a drag.
          if (dist > TOUCH_SLOP) { window.clearTimeout(s.timer); start.current = null; }
          return;
        }
        if (dist >= MOUSE_SLOP) beginDrag(s, e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      pointer.current = { x: e.clientX, y: e.clientY };
      setPdrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      track(e.clientX, e.clientY, s.t.id);
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      window.clearTimeout(s.timer);
      start.current = null;
      // No drag: the card's own click handler opens it (opening here would let the touch's
      // follow-up click land on the drawer overlay and close it again).
      if (!dragging.current) return;
      suppressClickUntil.current = performance.now() + 450;
      const p = hitTest(e.clientX, e.clientY, s.t.id) ?? placementRef.current;
      endDrag();
      if (p) commit(p);
    };
    const cancel = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      window.clearTimeout(s.timer);
      start.current = null;
      if (dragging.current) { endDrag(); setAnnounce('Move cancelled'); }
    };
    // Once a card is picked up on touch, the finger drags the card instead of scrolling the page.
    const blockScroll = (e: TouchEvent) => { if (dragging.current && e.cancelable) e.preventDefault(); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', blockScroll);
    };
  }, [beginDrag, endDrag, hitTest, track, commit]);

  // Auto-scroll while dragging near an edge: the board sideways (phones show one column at a
  // time), the page vertically, and tall columns.
  const isDragging = !!pdrag;
  useEffect(() => {
    if (!isDragging) return;
    let raf = 0;
    const step = (dist: number) => Math.max(2, Math.round((1 - Math.max(0, dist) / EDGE) * (reduce ? 10 : 18)));
    const tick = () => {
      const p = pointer.current;
      const board = boardRef.current;
      const id = start.current?.t.id;
      if (p && board && id) {
        let scrolled = false;
        const r = board.getBoundingClientRect();
        const maxX = board.scrollWidth - board.clientWidth;
        if (maxX > 0) {
          if (p.x < r.left + EDGE && board.scrollLeft > 0) { board.scrollLeft -= step(p.x - r.left); scrolled = true; }
          else if (p.x > r.right - EDGE && board.scrollLeft < maxX - 1) { board.scrollLeft += step(r.right - p.x); scrolled = true; }
        }
        const vh = window.innerHeight;
        const doc = document.scrollingElement ?? document.documentElement;
        if (p.y < EDGE && doc.scrollTop > 0) { window.scrollBy(0, -step(p.y)); scrolled = true; }
        else if (p.y > vh - EDGE - 56 && doc.scrollTop + vh < doc.scrollHeight - 1) { window.scrollBy(0, step(vh - 56 - p.y)); scrolled = true; }
        for (const col of colRefs.current.values()) {
          const cr = col.getBoundingClientRect();
          if (p.x < cr.left || p.x > cr.right || col.scrollHeight <= col.clientHeight) continue;
          if (p.y < cr.top + 40 && col.scrollTop > 0) { col.scrollTop -= step(p.y - cr.top); scrolled = true; }
          else if (p.y > cr.bottom - 40 && col.scrollTop < col.scrollHeight - col.clientHeight) { col.scrollTop += step(cr.bottom - p.y); scrolled = true; }
        }
        if (scrolled) track(p.x, p.y, id);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isDragging, reduce, track]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, t: TaskView) => {
    if (lifted || start.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const s: PressStart = { x: e.clientX, y: e.clientY, t, el: e.currentTarget, pointerId: e.pointerId, touch, timer: 0 };
    if (touch) {
      s.timer = window.setTimeout(() => {
        if (start.current === s && !dragging.current) beginDrag(s, s.x, s.y);
      }, LONG_PRESS_MS);
    }
    start.current = s;
  };

  // ── Keyboard drag ──
  const onKeyDown = (e: React.KeyboardEvent, t: TaskView) => {
    const cur = placement && placement.id === t.id ? placement : null;
    if (!lifted) {
      if (e.key === ' ') { e.preventDefault(); const p = placementOf(t); origin.current = p; setLifted(t.id); setPlacement(p); setAnnounce(`Picked up ${t.title}. Use arrow keys to move, space to drop, escape to cancel.`); }
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
      <div ref={boardRef} className={cx('board', pdrag && 'is-dragging')} role="group" aria-label="Board">
        {STATUS_ORDER.map((s) => {
          const list = columns.get(s) ?? [];
          const isTarget = !!placement && placement.status === s && (pdrag || lifted);
          return (
            <section key={s} className={cx('board-col panel', isTarget && 'drop-target')} aria-label={statusLabel(s, tactical)} data-status={s}>
              <div className="board-col-head">
                <StatusIcon status={s} />
                <span style={{ color: s === 'blocked' ? statusColor[s] : undefined }}>{statusLabel(s, tactical)}</span>
                <span className="faint num">{(base.get(s) ?? []).length}</span>
                {s === 'done' && doneWindow?.limited && <span className="faint board-col-note">{doneWindow.label}</span>}
                <span className="grow" />
                {s !== 'done' && (
                  <button className="icon-btn icon-btn-sm" aria-label={`Add to ${statusLabel(s, tactical)}`} onClick={() => ui.quickAdd(true, { status: s })}><Plus /></button>
                )}
              </div>
              <div className="board-col-body" role="list" ref={(el) => { if (el) colRefs.current.set(s, el); else colRefs.current.delete(s); }}>
                <AnimatePresence initial={false}>
                  {list.map((t) => (
                    <BoardCard key={t.id} task={t} members={members} project={showProject && t.projectId ? projects.get(t.projectId) : undefined}
                      dragging={pdrag?.id === t.id} lifted={lifted === t.id} onPointerDown={onPointerDown} onKeyDown={onKeyDown} onClick={onCardClick} />
                  ))}
                </AnimatePresence>
                {list.length === 0 && <div className="board-empty">{s === 'done' ? (doneWindow?.limited ? `Nothing completed in the ${doneWindow.label.toLowerCase()}` : `No ${L.tasksLower} completed yet`) : 'Drop here'}</div>}
                {s === 'done' && doneWindow && (
                  <button type="button" className="link board-older" onClick={doneWindow.onToggle}>
                    {doneWindow.limited ? 'Show older' : `Only the ${doneWindow.label.toLowerCase()}`}
                  </button>
                )}
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
