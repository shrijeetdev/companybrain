import { AnimatePresence, m } from 'motion/react';
import { Bot, Check, ChevronDown, Flag, Folder, LayoutGrid, List, SquareCheck, Tag, Trash2, User, Users, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useSearch, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import type { Priority, TaskQuery, TaskStatus, TaskView } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { qk, useMembers, useProjects, useTasks } from '../api/queries';
import { PriorityIcon, StatusIcon } from '../components/icons';
import { MenuList, Popover } from '../components/Overlay';
import { Empty, ErrorState, Segmented, SkeletonRows } from '../components/ui';
import { MemberPicker, ProjectMenu } from '../features/tasks/Pickers';
import { QuickAdd } from '../features/tasks/QuickAdd';
import { TaskBoard } from '../features/tasks/TaskBoard';
import { TaskList } from '../features/tasks/TaskList';
import { PRIORITIES, priorityLabel, STATUS_ORDER, statusLabel, useLabels } from '../lib/labels';
import { sfx } from '../lib/sfx';
import { useTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import { DAY, startOfDay } from '../lib/time';
import { cx } from '../lib/util';

type Scope = 'mine' | 'team' | 'agents';
const DONE_WINDOW_DAYS = 7;
interface Filters { scope: Scope; person?: string; project?: string; status?: TaskStatus[]; priority?: Priority; tag?: string; view: 'list' | 'board'; done: boolean }

function useUrlFilters(defaults: Partial<Filters> = {}): [Filters, (patch: Partial<Filters>) => void] {
  const search = useSearch();
  const [loc, navigate] = useLocation();
  const p = new URLSearchParams(search);
  const f: Filters = {
    scope: (p.get('scope') as Scope) ?? defaults.scope ?? 'mine',
    person: p.get('person') ?? undefined,
    project: p.get('project') ?? defaults.project,
    status: p.get('status')?.split(',').filter(Boolean) as TaskStatus[] | undefined,
    priority: (p.get('priority') as Priority) ?? undefined,
    tag: p.get('tag') ?? undefined,
    view: (p.get('view') as Filters['view']) ?? defaults.view ?? 'list',
    done: p.get('done') === '1',
  };
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    const q = new URLSearchParams();
    if (next.scope !== (defaults.scope ?? 'mine')) q.set('scope', next.scope);
    if (next.person) q.set('person', next.person);
    if (next.project && next.project !== defaults.project) q.set('project', next.project);
    if (next.status?.length) q.set('status', next.status.join(','));
    if (next.priority) q.set('priority', next.priority);
    if (next.tag) q.set('tag', next.tag);
    if (next.view !== (defaults.view ?? 'list')) q.set('view', next.view);
    if (next.done) q.set('done', '1');
    const task = p.get('task');
    if (task) q.set('task', task);
    const s = q.toString();
    navigate(`${loc}${s ? `?${s}` : ''}`, { replace: true });
  };
  return [f, set];
}

function FilterMenu({ label, icon, active, children }: { label: string; icon: React.ReactNode; active: boolean; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} className={cx('chip chip-btn chip-lg', active && 'active')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{icon}{label}<ChevronDown /></button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={label}>{children(() => setOpen(false))}</Popover>
    </>
  );
}

/** Tasks screen, also embedded in a project page (projectId fixed). */
export function TasksView({ projectId, title }: { projectId?: string; title?: React.ReactNode }) {
  const L = useLabels();
  const { tactical } = useTheme();
  const qc = useQueryClient();
  const [f, setF] = useUrlFilters(projectId ? { scope: 'team', project: projectId } : {});
  const { data: members } = useMembers();
  const { data: projects } = useProjects();
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  // Board: the Done column only loads the last week of completions unless asked for more.
  const [olderDone, setOlderDone] = useState(false);
  const doneSince = useMemo(() => startOfDay(Date.now()) - DONE_WINDOW_DAYS * DAY, []);

  const query: TaskQuery = useMemo(() => {
    const q: TaskQuery = { includeDone: f.done || f.view === 'board' };
    if (f.view === 'board' && !olderDone) q.completedSince = doneSince;
    if (f.priority) q.priority = [f.priority];
    if (f.person) q.assigneeId = f.person;
    else if (f.scope === 'mine') q.assigneeId = 'me';
    if (f.scope === 'agents' && !f.person) q.view = 'agents';
    if (projectId) q.projectId = projectId;
    else if (f.project) q.projectId = f.project;
    if (f.status?.length) q.status = f.status;
    if (f.tag) q.tag = f.tag;
    return q;
  }, [f, projectId, olderDone, doneSince]);
  const { data, isLoading, error, refetch } = useTasks(query);
  const tasks = useMemo(() => data ?? [], [data]);
  const doneWindow = useMemo(() => ({ label: `Last ${DONE_WINDOW_DAYS} days`, limited: !olderDone, onToggle: () => setOlderDone((o) => !o) }), [olderDone]);
  const tags = useMemo(() => [...new Set((data ?? []).flatMap((t) => t.tags))].sort(), [data]);

  const onSelect = useCallback((t: TaskView, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault?.();
    setSelection((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; });
  }, []);

  const bulk = async (op: Parameters<typeof api.tasks.bulk>[1], verb: string) => {
    const ids = [...selection];
    try {
      const r = await api.tasks.bulk(ids, op);
      if (op.kind === 'complete') sfx.hit();
      toast.success(`${verb} ${r.ok.length} ${r.ok.length === 1 ? L.taskLower : L.tasksLower}${r.failed.length ? ` · ${r.failed.length} failed` : ''}`);
      setSelection(new Set());
      void qc.invalidateQueries({ queryKey: qk.tasksAll });
      void qc.invalidateQueries({ queryKey: qk.briefing });
      void qc.invalidateQueries({ queryKey: qk.game.hud });
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const personName = f.person ? members?.find((m) => m.id === f.person)?.name : undefined;
  const projectName = f.project ? projects?.find((p) => p.id === f.project)?.name : undefined;
  const filtersActive = !!(f.person || (!projectId && f.project) || f.status?.length || f.priority || f.tag);

  return (
    <>
      {title ?? (
        <div className="page-head">
          <div>
            <h1>{L.tasks}</h1>
            <div className="sub">{data ? `${tasks.filter((t) => t.status !== 'done').length} open${f.scope === 'mine' && !f.person ? ' assigned to you' : ''}` : ' '}</div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <QuickAdd defaults={projectId ? { projectId } : undefined} />
      </div>
      <div className="toolbar">
        <Segmented label="Scope" value={f.person ? ('' as Scope) : f.scope} onChange={(v) => setF({ scope: v, person: undefined })}
          options={[{ value: 'mine', label: 'Mine', icon: <User /> }, { value: 'team', label: L.team, icon: <Users /> }, { value: 'agents', label: tactical ? 'AI' : 'Agents', icon: <Bot /> }]} />
        <div className="filter-scroll">
          <FilterMenu label={personName ?? 'Person'} icon={<User />} active={!!f.person}>
            {(close) => <MemberPicker members={members ?? []} selected={f.person ? [f.person] : []} single onToggle={(id) => { setF({ person: f.person === id ? undefined : id }); close(); }} />}
          </FilterMenu>
          {!projectId && (
            <FilterMenu label={projectName ?? L.project} icon={<Folder />} active={!!f.project}>
              {(close) => <ProjectMenu projects={projects ?? []} value={f.project ?? null} onDone={close} onChange={(id) => setF({ project: id ?? undefined })} />}
            </FilterMenu>
          )}
          <FilterMenu label={f.status?.length ? f.status.map((s) => statusLabel(s, tactical)).join(', ') : 'Status'} icon={<StatusIcon status={f.status?.[0] ?? 'todo'} />} active={!!f.status?.length}>
            {() => <MenuList items={STATUS_ORDER.map((s) => ({ key: s, label: statusLabel(s, tactical), icon: <StatusIcon status={s} />, checked: !!f.status?.includes(s), onSelect: () => { const cur = new Set(f.status ?? []); if (cur.has(s)) cur.delete(s); else cur.add(s); setF({ status: [...cur] }); } }))} />}
          </FilterMenu>
          <FilterMenu label={f.priority ? priorityLabel(f.priority) : 'Priority'} icon={<Flag />} active={!!f.priority}>
            {(close) => <MenuList onDone={close} items={[{ key: 'any', label: 'Any priority', onSelect: () => setF({ priority: undefined }), checked: !f.priority }, ...PRIORITIES.map((p) => ({ key: p, label: priorityLabel(p), icon: <PriorityIcon priority={p} />, checked: f.priority === p, onSelect: () => setF({ priority: p }) }))]} />}
          </FilterMenu>
          {tags.length > 0 && (
            <FilterMenu label={f.tag ? `#${f.tag}` : 'Tag'} icon={<Tag />} active={!!f.tag}>
              {(close) => <MenuList onDone={close} items={[{ key: 'any', label: 'Any tag', checked: !f.tag, onSelect: () => setF({ tag: undefined }) }, ...tags.map((t) => ({ key: t, label: `#${t}`, checked: f.tag === t, onSelect: () => setF({ tag: t }) }))]} />}
            </FilterMenu>
          )}
          {filtersActive && <button className="chip chip-btn chip-lg" onClick={() => setF({ person: undefined, project: projectId, status: undefined, priority: undefined, tag: undefined })}><X /> Clear</button>}
        </div>
        <span className="spacer" />
        {f.view === 'list' && <button className={cx('chip chip-btn chip-lg', f.done && 'active')} aria-pressed={f.done} onClick={() => setF({ done: !f.done })}><Check /> {L.completed}</button>}
        <Segmented label="View" value={f.view} onChange={(v) => setF({ view: v })} options={[{ value: 'list', label: 'List', icon: <List /> }, { value: 'board', label: 'Board', icon: <LayoutGrid /> }]} />
      </div>

      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading && !data ? (
        <div className="panel"><SkeletonRows n={8} /></div>
      ) : f.view === 'board' ? (
        <TaskBoard tasks={tasks} showProject={!projectId} doneWindow={doneWindow} />
      ) : (
        <div className="panel" style={{ padding: '6px 0' }}>
          <TaskList tasks={tasks} showDone={f.done} selection={selection} onSelect={onSelect} showProject={!projectId}
            emptyState={
              <Empty art={tactical ? '🎯' : '✨'} title={filtersActive ? 'Nothing matches these filters' : tactical ? 'No active missions' : 'Nothing here — nice'}>
                {filtersActive ? 'Try clearing a filter.' : `Add one above — type naturally, like “Call Raj tomorrow 3pm !high”.`}
              </Empty>
            } />
          {data && tasks.length > 0 && selection.size === 0 && (
            <div className="faint" style={{ fontSize: 12, padding: '4px 20px 10px' }}>
              <SquareCheck size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Tip: ⌘/Ctrl-click or press <kbd className="kbd">X</kbd> on a row to multi-select.
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {selection.size > 0 && (
          <m.div className="bulkbar" initial={{ y: 40, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%' }} exit={{ y: 40, opacity: 0, x: '-50%' }} transition={{ type: 'spring', stiffness: 500, damping: 36 }} role="toolbar" aria-label="Bulk actions">
            <b className="num" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{selection.size} selected</b>
            <button className="btn btn-sm btn-primary" onClick={() => void bulk({ kind: 'complete' }, 'Completed')}><Check /> {L.complete}</button>
            <BulkMenu label="Status" icon={<StatusIcon status="in_progress" />}>{(close) => <MenuList onDone={close} items={STATUS_ORDER.map((s) => ({ key: s, label: statusLabel(s, tactical), icon: <StatusIcon status={s} />, onSelect: () => void bulk({ kind: 'status', value: s }, 'Updated') }))} />}</BulkMenu>
            <BulkMenu label="Assign" icon={<User />}>{(close) => <MemberPicker members={members ?? []} selected={[]} onToggle={(id) => { close(); void bulk({ kind: 'assign', value: [id] }, 'Assigned'); }} />}</BulkMenu>
            <BulkMenu label="Move" icon={<Folder />}>{(close) => <ProjectMenu projects={projects ?? []} value={null} onDone={close} onChange={(id) => void bulk({ kind: 'move', value: id }, 'Moved')} />}</BulkMenu>
            <button className="btn btn-sm btn-danger" onClick={() => { if (window.confirm(`Delete ${selection.size} ${L.tasksLower}?`)) void bulk({ kind: 'delete' }, 'Deleted'); }}><Trash2 /></button>
            <button className="icon-btn icon-btn-sm" aria-label="Clear selection" onClick={() => setSelection(new Set())}><X /></button>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

function BulkMenu({ label, icon, children }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} className="btn btn-sm" onClick={() => setOpen((o) => !o)}>{icon}{label}</button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top-start" label={label}>{children(() => setOpen(false))}</Popover>
    </>
  );
}

export function Tasks() {
  return <TasksView />;
}

