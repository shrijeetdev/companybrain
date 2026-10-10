import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, Reorder } from 'motion/react';
import {
  AlarmClock, CalendarClock, Check, ChevronDown, Copy, Flag, Folder, GripVertical, Hash, Hourglass, Link2, ListChecks,
  MoreHorizontal, Plus, Repeat, RotateCcw, Send, Tag, Trash2, Users, X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Recurrence, Subtask, TaskView, WaitingOn } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { markLocal, qk, upsertTaskInCaches, useMembers, useMemberMap, useProjects, useTask } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { ChannelIcon, channelName, PriorityIcon, StatusIcon } from '../../components/icons';
import { Drawer, MenuList, Popover } from '../../components/Overlay';
import { Bar, SkeletonRows } from '../../components/ui';
import { priorityLabel, statusLabel, useLabels } from '../../lib/labels';
import { Markdown } from '../../lib/markdown';
import { sfx } from '../../lib/sfx';
import { useTheme } from '../../lib/theme';
import { ago, fmtDue, zoned } from '../../lib/time';
import { toast } from '../../lib/toast';
import { ui, useUi } from '../../lib/ui';
import { copyText, cx } from '../../lib/util';
import { ActivityTimeline, Composer } from './Activity';
import { useTaskActions } from './actions';
import { DuePicker } from './DuePicker';
import { MemberPicker, PriorityMenu, ProjectMenu, StatusMenu } from './Pickers';
import { offsetText, recurrenceText } from './QuickAdd';

function PropPopover({ label, icon, button, children, width }: { label: string; icon: ReactNode; button: ReactNode; children: (close: () => void) => ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <span className="p-label">{icon}{label}</span>
      <div style={{ minWidth: 0 }}>
        <button ref={ref} className="prop-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label}>{button}</button>
        <Popover open={open} onClose={() => setOpen(false)} anchor={ref} width={width} label={label}>{children(() => setOpen(false))}</Popover>
      </div>
    </>
  );
}

export function TaskDrawerHost() {
  const { taskId } = useUi();
  // Open from ?task= on first load.
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get('task');
    if (id) ui.openTask(id);
  }, []);
  return (
    <Drawer open={!!taskId} onClose={() => ui.openTask(null)} label="Task details">
      {taskId && <TaskDetail id={taskId} />}
    </Drawer>
  );
}

function TaskDetail({ id }: { id: string }) {
  const { data: task, error, isLoading } = useTask(id);
  useEffect(() => {
    if (error) { toast.error(errorMessage(error)); ui.openTask(null); }
  }, [error]);
  if (isLoading || !task) return <div style={{ padding: 24 }}><SkeletonRows n={6} /></div>;
  return <TaskDetailBody task={task} />;
}

function TaskDetailBody({ task }: { task: TaskView }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const qc = useQueryClient();
  const { update, complete, reopen, remove } = useTaskActions();
  const { data: allMembers } = useMembers();
  const members = useMemberMap();
  const { data: projects } = useProjects();
  const [title, setTitle] = useState(task.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(task.notes);
  const [moreOpen, setMoreOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const completeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => { if (!editingNotes) setNotes(task.notes); }, [task.notes, editingNotes]);

  const project = projects?.find((p) => p.id === task.projectId);
  const done = task.status === 'done';
  const saveTitle = () => { const t = title.trim(); if (t && t !== task.title) void update(task, { title: t }); else setTitle(task.title); };
  const saveNotes = () => { setEditingNotes(false); if (notes !== task.notes) void update(task, { notes }); };
  const toggleAssignee = (mid: string) => {
    const ids = task.assigneeIds.includes(mid) ? task.assigneeIds.filter((x) => x !== mid) : [...task.assigneeIds, mid];
    void update(task, { assigneeIds: ids });
  };
  const sub = async (fn: () => Promise<TaskView>) => {
    markLocal(task.id);
    try { upsertTaskInCaches(qc, await fn()); } catch (e) { toast.error(errorMessage(e)); }
  };
  const assignees = task.assigneeIds.map((i) => members.get(i)).filter(Boolean);

  return (
    <>
      <div className="drawer-head">
        <div className="sheet-grip only-mobile" style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }} />
        <button ref={statusRef} className="chip chip-btn chip-lg" onClick={() => setStatusOpen((o) => !o)} aria-label="Status">
          <StatusIcon status={task.status} /> {statusLabel(task.status, tactical)} <ChevronDown />
        </button>
        <Popover open={statusOpen} onClose={() => setStatusOpen(false)} anchor={statusRef} label="Status">
          <StatusMenu value={task.status} onDone={() => setStatusOpen(false)} onChange={(s) => {
            if (s === 'done') void complete(task, statusRef.current);
            else if (done) void reopen(task).then(() => update({ ...task, status: 'todo' }, { status: s }));
            else void update(task, { status: s });
          }} />
        </Popover>
        {task.source.channel !== 'manual' && (
          <span className="chip" title={task.source.from ?? undefined}><ChannelIcon channel={task.source.channel} size={13} /> {channelName(task.source.channel)}</span>
        )}
        {task.isStale && <span className="chip tone-warning">Agent quiet</span>}
        <span className="grow" />
        <button ref={completeRef} className={cx('btn btn-sm', done ? '' : 'btn-primary')} onClick={() => (done ? void reopen(task) : void complete(task, completeRef.current))}>
          {done ? <><RotateCcw /> {L.reopen}</> : <><Check /> {L.complete}</>}
        </button>
        <button ref={moreRef} className="icon-btn icon-btn-sm" aria-label="More actions" onClick={() => setMoreOpen((o) => !o)}><MoreHorizontal /></button>
        <Popover open={moreOpen} onClose={() => setMoreOpen(false)} anchor={moreRef} placement="bottom-end" label="More">
          <MenuList onDone={() => setMoreOpen(false)} items={[
            { key: 'copy', label: 'Copy link', icon: <Link2 />, onSelect: () => void copyText(`${location.origin}/tasks/${task.id}`).then(() => toast('Link copied')) },
            { key: 'id', label: 'Copy ID', icon: <Copy />, onSelect: () => void copyText(task.id).then(() => toast('ID copied')) },
            'sep',
            { key: 'del', label: `Delete ${L.taskLower}`, icon: <Trash2 />, danger: true, onSelect: () => { if (window.confirm(`Delete “${task.title}”? This can be undone from Settings → Activity log.`)) { void remove(task); ui.openTask(null); } } },
          ]} />
        </Popover>
        <button className="icon-btn icon-btn-sm" aria-label="Close" onClick={() => ui.openTask(null)}><X /></button>
      </div>

      <div className="drawer-body">
        <textarea
          className="drawer-title"
          value={title}
          rows={1}
          aria-label="Title"
          onChange={(e) => { setTitle(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
        />

        <div className="props">
          <PropPopover label="Assignees" icon={<Users />} width={270} button={
            assignees.length ? (
              <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {assignees.map((m) => <span key={m!.id} className="row" style={{ gap: 6 }}><Avatar member={m} size={22} /><span>{m!.name.split(' ')[0]}</span>{m!.kind === 'agent' && <span className="chip tone-info" style={{ height: 18, fontSize: 10.5 }}>AI</span>}</span>)}
              </span>
            ) : <span className="placeholder">Unassigned</span>
          }>
            {() => <MemberPicker members={allMembers ?? []} selected={task.assigneeIds} onToggle={toggleAssignee} />}
          </PropPopover>

          <PropPopover label="Due" icon={<CalendarClock />} button={
            task.dueAt ? <span className={cx(task.isOverdue && 'due-overdue')} style={task.isOverdue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{fmtDue(task.dueAt, task.dueAllDay)}{task.isOverdue ? ` · ${L.overdue.toLowerCase()}` : ''}</span> : <span className="placeholder">No date</span>
          }>
            {(close) => <DuePicker value={{ dueAt: task.dueAt, dueAllDay: task.dueAllDay }} onChange={(v) => void update(task, v)} onDone={close} />}
          </PropPopover>

          <PropPopover label="Priority" icon={<Flag />} button={<span className="row" style={{ gap: 8 }}><PriorityIcon priority={task.priority} />{priorityLabel(task.priority)}</span>}>
            {(close) => <PriorityMenu value={task.priority} onDone={close} onChange={(p) => void update(task, { priority: p })} />}
          </PropPopover>

          <PropPopover label={L.project} icon={<Folder />} button={project ? <span className="row" style={{ gap: 8 }}><span>{project.emoji}</span>{project.name}</span> : <span className="placeholder">None</span>}>
            {(close) => <ProjectMenu projects={projects ?? []} value={task.projectId} onDone={close} onChange={(pid) => void update(task, { projectId: pid })} />}
          </PropPopover>

          <PropPopover label="Reminders" icon={<AlarmClock />} button={
            task.reminderOffsets === null ? <span className="placeholder">Team default</span> : task.reminderOffsets.length === 0 ? <span className="placeholder">None</span> : <span>{task.reminderOffsets.map(offsetText).join(', ')}</span>
          }>
            {(close) => <RemindersEditor value={task.reminderOffsets} onChange={(v) => void update(task, { reminderOffsets: v })} onDone={close} />}
          </PropPopover>

          <PropPopover label="Repeat" icon={<Repeat />} button={task.recurrence ? <span>{recurrenceText(task.recurrence)}</span> : <span className="placeholder">Never</span>}>
            {(close) => <RecurrenceMenu task={task} onDone={close} onChange={(r) => void update(task, { recurrence: r })} />}
          </PropPopover>

          <span className="p-label"><Tag />Tags</span>
          <TagsEditor tags={task.tags} onChange={(tags) => void update(task, { tags })} />
        </div>

        <WaitingOnSection task={task} onChange={(w) => void update(task, { waitingOn: w })} />

        <section className="drawer-section">
          <div className="section-title">Notes</div>
          {editingNotes ? (
            <textarea className="textarea" autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={5}
              placeholder="Add context, links, checklists… Markdown-light: **bold**, *italic*, `code`, - lists" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); saveNotes(); } }} />
          ) : (
            <div className="notes-view" role="button" tabIndex={0} onClick={() => setEditingNotes(true)} onKeyDown={(e) => { if (e.key === 'Enter') setEditingNotes(true); }}>
              {task.notes ? <Markdown text={task.notes} /> : <span className="faint">Add notes…</span>}
            </div>
          )}
        </section>

        <Subtasks task={task} onAdd={(t) => sub(() => api.tasks.addSubtask(task.id, t))}
          onToggle={(s) => { if (!s.done) sfx.tick(); void sub(() => api.tasks.updateSubtask(task.id, s.id, { done: !s.done })); }}
          onRename={(s, t) => void sub(() => api.tasks.updateSubtask(task.id, s.id, { title: t }))}
          onRemove={(s) => void sub(() => api.tasks.removeSubtask(task.id, s.id))} />

        <section className="drawer-section">
          <div className="section-title">Activity</div>
          <ActivityTimeline task={task} />
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Created {ago(task.createdAt)} · updated {ago(task.updatedAt)}</div>
        </section>
      </div>
      <Composer task={task} />
    </>
  );
}

function RemindersEditor({ value, onChange, onDone }: { value: number[] | null; onChange: (v: number[] | null) => void; onDone: () => void }) {
  const opts = [0, 15, 60, 180, 1440, 2880];
  const cur = value ?? [];
  return (
    <div style={{ padding: 8, width: 260, display: 'grid', gap: 10 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {opts.map((o) => {
          const on = cur.includes(o);
          return <button key={o} className={cx('chip chip-btn', on && 'active')} aria-pressed={on} onClick={() => onChange(on ? cur.filter((x) => x !== o) : [...cur, o].sort((a, b) => b - a))}>{offsetText(o)}</button>;
        })}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => { onChange(null); onDone(); }}>Use team default</button>
        <button className="btn btn-sm btn-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function RecurrenceMenu({ task, onChange, onDone }: { task: TaskView; onChange: (r: Recurrence | null) => void; onDone: () => void }) {
  const wd = task.dueAt ? zoned(task.dueAt).weekday : 1;
  const items: [string, Recurrence | null][] = [
    ['Never', null],
    ['Every day', { freq: 'daily', interval: 1 }],
    ['Every weekday', { freq: 'weekdays', interval: 1 }],
    [`Every week on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd]}`, { freq: 'weekly', interval: 1, byWeekday: [wd] }],
    ['Every 2 weeks', { freq: 'weekly', interval: 2, byWeekday: [wd] }],
    ['Every month', { freq: 'monthly', interval: 1 }],
    ['Every year', { freq: 'yearly', interval: 1 }],
  ];
  const same = (a: Recurrence | null, b: Recurrence | null) => JSON.stringify(a) === JSON.stringify(b);
  return <MenuList onDone={onDone} items={items.map(([label, r]) => ({ key: label, label, icon: <Repeat />, checked: same(r, task.recurrence), onSelect: () => onChange(r) }))} />;
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim().replace(/^#/, '').toLowerCase(); if (t && !tags.includes(t)) onChange([...tags, t]); setV(''); };
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6, minHeight: 36 }}>
      {tags.map((t) => (
        <span key={t} className="chip"><Hash />{t}<button aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} style={{ display: 'grid', marginRight: -3 }}><X size={12} /></button></span>
      ))}
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add tag…" aria-label="Add tag" style={{ border: 0, background: 'transparent', outline: 'none', width: 90, fontSize: 13, height: 28 }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1)); }} onBlur={add} />
    </div>
  );
}

function WaitingOnSection({ task, onChange }: { task: TaskView; onChange: (w: Omit<WaitingOn, 'since' | 'lastNudgedAt'> | null) => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const w = task.waitingOn;
  const [form, setForm] = useState({ name: w?.name ?? '', contact: w?.contact ?? '', channel: w?.channel ?? 'whatsapp', nudge: w?.nudgeEveryHours ?? 24 });
  const [nudging, setNudging] = useState(false);
  useEffect(() => { setForm({ name: w?.name ?? '', contact: w?.contact ?? '', channel: w?.channel ?? 'whatsapp', nudge: w?.nudgeEveryHours ?? 24 }); }, [w]);
  const nudge = async () => {
    setNudging(true);
    try { upsertTaskInCaches(qc, await api.tasks.nudge(task.id)); toast.success(`Nudged ${w?.name.split(' · ')[0]}`); void qc.invalidateQueries({ queryKey: qk.activity(task.id) }); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setNudging(false); }
  };
  if (!w && !editing) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }} onClick={() => setEditing(true)}><Hourglass /> Waiting on someone outside the team?</button>
    );
  }
  if (editing) {
    return (
      <section className="drawer-section waiting-card" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--border)' }}>
        <div className="section-title"><Hourglass size={14} /> Waiting on</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input className="input" placeholder="Name (e.g. Laura · Acme)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Name" />
          <input className="input" placeholder="Phone or email" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} aria-label="Contact" />
          <select className="select" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as WaitingOn['channel'] })} aria-label="Channel">
            <option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Other</option>
          </select>
          <select className="select" value={String(form.nudge ?? 0)} onChange={(e) => setForm({ ...form, nudge: Number(e.target.value) })} aria-label="Auto-nudge">
            <option value="0">Never auto-nudge</option><option value="12">Nudge every 12h</option><option value="24">Nudge daily</option><option value="48">Every 2 days</option><option value="72">Every 3 days</option><option value="168">Weekly</option>
          </select>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {w && <button className="btn btn-ghost btn-sm" onClick={() => { onChange(null); setEditing(false); }}>Remove</button>}
          <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn btn-sm btn-primary" disabled={!form.name.trim()} onClick={() => { onChange({ name: form.name.trim(), contact: form.contact.trim() || null, channel: form.channel as WaitingOn['channel'], nudgeEveryHours: form.nudge || null }); setEditing(false); }}>Save</button>
        </div>
      </section>
    );
  }
  return (
    <section className="drawer-section waiting-card">
      <div className="row" style={{ gap: 10 }}>
        <Hourglass size={16} style={{ color: 'var(--warning)' }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>Waiting on {w!.name}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            since {ago(w!.since)} · {w!.channel === 'whatsapp' ? 'WhatsApp' : w!.channel === 'email' ? 'Email' : 'Other'}{w!.contact ? ` · ${w!.contact}` : ''}
            {w!.nudgeEveryHours ? ` · auto-nudge every ${w!.nudgeEveryHours}h` : ''}{w!.lastNudgedAt ? ` · last nudged ${ago(w!.lastNudgedAt)}` : ''}
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-sm btn-primary" disabled={nudging || !w!.contact} onClick={() => void nudge()} title={w!.contact ? undefined : 'Add a phone or email to nudge'}><Send /> Nudge now</button>
      </div>
    </section>
  );
}

function Subtasks({ task, onAdd, onToggle, onRename, onRemove }: {
  task: TaskView; onAdd: (t: string) => Promise<void>; onToggle: (s: Subtask) => void; onRename: (s: Subtask, t: string) => void; onRemove: (s: Subtask) => void;
}) {
  const L = useLabels();
  const [v, setV] = useState('');
  const [order, setOrder] = useState(task.subtasks);
  useEffect(() => setOrder((cur) => {
    // keep local drag order, but reflect server adds/removes/updates
    const byId = new Map(task.subtasks.map((s) => [s.id, s]));
    const kept = cur.filter((s) => byId.has(s.id)).map((s) => byId.get(s.id)!);
    const added = task.subtasks.filter((s) => !cur.some((c) => c.id === s.id));
    return [...kept, ...added];
  }), [task.subtasks]);
  const done = task.subtasks.filter((s) => s.done).length;
  return (
    <section className="drawer-section">
      <div className="section-title"><ListChecks size={14} /> {L.subtasks} {task.subtasks.length > 0 && <span className="faint num">{done}/{task.subtasks.length}</span>}</div>
      {task.subtasks.length > 0 && <div className="subtask-progress"><Bar pct={(done / task.subtasks.length) * 100} color="var(--success)" height={4} className="grow" /></div>}
      <Reorder.Group axis="y" values={order} onReorder={setOrder} as="div">
        <AnimatePresence initial={false}>
          {order.map((s) => (
            <Reorder.Item key={s.id} value={s} as="div" className={cx('subtask', s.done && 'done')} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <GripVertical className="grip" aria-hidden />
              <button className={cx('check check-sq', s.done && 'is-done')} aria-label={s.done ? `Mark “${s.title}” not done` : `Complete “${s.title}”`} onClick={() => onToggle(s)}><Check style={{ opacity: s.done ? 1 : 0 }} /></button>
              <input defaultValue={s.title} aria-label={`${L.subtask} title`} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== s.title) onRename(s, t); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <button className="icon-btn icon-btn-sm" aria-label={`Delete “${s.title}”`} onClick={() => onRemove(s)}><X /></button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <div className="subtask">
        <Plus size={16} className="faint" style={{ marginLeft: 22 }} />
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={`Add ${L.subtask.toLowerCase()}…`} aria-label={`Add ${L.subtask.toLowerCase()}`}
          onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { const t = v.trim(); setV(''); void onAdd(t); } }} />
      </div>
    </section>
  );
}

