import { useQueryClient } from '@tanstack/react-query';
import { m } from 'motion/react';
import { Archive, CalendarClock, Pencil, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import type { ProjectStatus, ProjectSummary } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api, type ProjectInput } from '../api/endpoints';
import { qk, useMe, useMemberMap, useMembers, useProjects } from '../api/queries';
import { AvatarStack } from '../components/Avatar';
import { Modal, Popover } from '../components/Overlay';
import { Bar, Empty, ErrorState, Ring, Skeleton, Ticker } from '../components/ui';
import { DuePicker } from '../features/tasks/DuePicker';
import { MemberPicker } from '../features/tasks/Pickers';
import { useLabels } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { fmtDate } from '../lib/time';
import { toast } from '../lib/toast';
import { cx } from '../lib/util';
import { TasksView } from './Tasks';

export const PROJECT_COLORS = ['#3b6ff6', '#7c5cff', '#e0559a', '#ef4444', '#f59e0b', '#10b981', '#0ea5a4', '#06b6d4', '#64748b', '#a3e635'];
const EMOJIS = ['🚀', '🌐', '🤝', '📈', '🎯', '🧪', '💡', '🛠️', '📣', '💰', '🎨', '📦', '🧭', '⚡', '🔒', '📱', '🧠', '🏆', '🌱', '🗺️', '🎬', '✍️', '🤖', '🏗️'];

export function Projects({ id }: { id?: string }) {
  if (id) return <ProjectPage id={id} />;
  return <ProjectGrid />;
}

function ProjectGrid() {
  const L = useLabels();
  const me = useMe();
  const { data, error, refetch, isLoading } = useProjects();
  const [editing, setEditing] = useState<ProjectSummary | 'new' | null>(null);
  const canCreate = me.role !== 'guest';
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{L.projects}</h1>
          <div className="sub">{data ? `${data.filter((p) => p.status === 'active').length} active · ${data.reduce((s, p) => s + p.counts.open, 0)} open ${L.tasksLower}` : ' '}</div>
        </div>
        {canCreate && <div className="actions"><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> New {L.project.toLowerCase()}</button></div>}
      </div>
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <div className="grid-cards">
          {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="panel panel-pad"><Skeleton h={140} /></div>)}
          {data?.map((p, i) => <ProjectCard key={p.id} p={p} i={i} onEdit={() => setEditing(p)} />)}
          {data?.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }}><Empty art="🗺️" title={`No ${L.projects.toLowerCase()} yet`} action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> Create one</button>}>Group related {L.tasksLower} so the whole team sees progress.</Empty></div>
          )}
        </div>
      )}
      <ProjectModal project={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ProjectCard({ p, i, onEdit }: { p: ProjectSummary; i: number; onEdit: () => void }) {
  const members = useMemberMap();
  const L = useLabels();
  const { tactical } = useTheme();
  const pct = Math.round(p.progress * 100);
  return (
    <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 30 }}>
      <Link href={`/projects/${p.id}`} className="panel project-card" style={{ ['--pc' as string]: p.color }}>
        <div className="pc-top">
          <span className="pc-emoji">{p.emoji}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            {tactical && <div className="eyebrow" style={{ color: 'var(--pc)' }}>{L.project}</div>}
            <h3 className="pc-name truncate">{p.name}</h3>
            <p className="pc-desc">{p.description || <span className="faint">No description</span>}</p>
          </div>
          <Ring pct={pct} size={58} stroke={6} color={p.color} segments={tactical ? 12 : undefined}>
            <span className="num-display" style={{ fontSize: 13, fontWeight: 700 }}><Ticker value={pct} />%</span>
          </Ring>
        </div>
        <Bar pct={pct} color={p.color} height={4} />
        <div className="pc-foot">
          <span><b className="num">{p.counts.open}</b> open</span>
          <span><b className="num">{p.counts.done}</b> done</span>
          {p.counts.overdue > 0 && <span className="chip tone-danger" style={{ height: 22 }}>{p.counts.overdue} {L.overdue.toLowerCase()}</span>}
          {p.status !== 'active' && <span className="chip">{p.status}</span>}
          <span className="grow" />
          {p.dueAt && <span className="faint row" style={{ gap: 4, fontSize: 12 }}><CalendarClock size={13} />{fmtDate(p.dueAt, { month: 'short', day: 'numeric' })}</span>}
          <AvatarStack members={p.memberIds.map((id) => members.get(id))} size={24} max={4} />
          <button className="icon-btn icon-btn-sm pc-edit" aria-label={`Edit ${p.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}><Pencil /></button>
        </div>
      </Link>
    </m.div>
  );
}

function ProjectPage({ id }: { id: string }) {
  const { data: projects, isLoading } = useProjects();
  const members = useMemberMap();
  const L = useLabels();
  const [editing, setEditing] = useState(false);
  const p = projects?.find((x) => x.id === id);
  if (isLoading) return <div className="panel panel-pad"><Skeleton h={80} /></div>;
  if (!p) return <Empty art="🧭" title={`${L.project} not found`} action={<Link href="/projects" className="btn">All {L.projects.toLowerCase()}</Link>}>It may have been archived or deleted.</Empty>;
  const pct = Math.round(p.progress * 100);
  return (
    <>
      <TasksView projectId={p.id} title={
        <div className="panel project-hero" style={{ ['--pc' as string]: p.color }}>
          <span className="pc-emoji big">{p.emoji}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="eyebrow"><Link href="/projects" className="link" style={{ fontWeight: 650 }}>{L.projects}</Link> / {p.status}</div>
            <h1 className="ph-name display">{p.name}</h1>
            {p.description && <p className="muted" style={{ fontSize: 14 }}>{p.description}</p>}
            <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
              <AvatarStack members={p.memberIds.map((m) => members.get(m))} size={28} max={8} />
              <span className="faint" style={{ fontSize: 13 }}>{p.counts.open} open · {p.counts.done} done{p.counts.overdue ? ` · ${p.counts.overdue} ${L.overdue.toLowerCase()}` : ''}</span>
              {p.dueAt && <span className="chip"><CalendarClock /> Due {fmtDate(p.dueAt, { month: 'short', day: 'numeric' })}</span>}
            </div>
          </div>
          <div className="ph-side">
            <Ring pct={pct} size={84} stroke={8} color={p.color} glow>
              <span className="num-display" style={{ fontSize: 20, fontWeight: 750 }}><Ticker value={pct} />%</span>
            </Ring>
            <button className="btn btn-sm" onClick={() => setEditing(true)}><Pencil /> Edit</button>
          </div>
        </div>
      } />
      <ProjectModal project={editing ? p : null} onClose={() => setEditing(false)} />
    </>
  );
}

function ProjectModal({ project, onClose }: { project: ProjectSummary | 'new' | null; onClose: () => void }) {
  const L = useLabels();
  const open = project !== null;
  return (
    <Modal open={open} onClose={onClose} title={project === 'new' ? `New ${L.project.toLowerCase()}` : `Edit ${L.project.toLowerCase()}`} width={560}>
      {open && <ProjectForm project={project === 'new' ? null : project} onClose={onClose} />}
    </Modal>
  );
}

function ProjectForm({ project, onClose }: { project: ProjectSummary | null; onClose: () => void }) {
  const L = useLabels();
  const me = useMe();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: members } = useMembers();
  const [f, setF] = useState<ProjectInput & { name: string }>({
    name: project?.name ?? '', emoji: project?.emoji ?? '🚀', color: project?.color ?? PROJECT_COLORS[0], description: project?.description ?? '',
    memberIds: project?.memberIds ?? [me.id], leadId: project?.leadId ?? me.id, dueAt: project?.dueAt ?? null, status: project?.status ?? 'active',
  });
  const [busy, setBusy] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const dueRef = useRef<HTMLButtonElement>(null);
  const memRef = useRef<HTMLButtonElement>(null);
  const map = useMemberMap();
  const save = async () => {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      const saved = project ? await api.projects.update(project.id, f) : await api.projects.create({ ...f, name: f.name.trim() });
      await qc.invalidateQueries({ queryKey: qk.projects });
      toast.success(project ? 'Saved' : `${L.project} created`);
      onClose();
      if (!project) navigate(`/projects/${saved.id}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!project) return;
    try { await api.projects.update(project.id, { status: 'archived' }); await qc.invalidateQueries({ queryKey: qk.projects }); toast(`Archived “${project.name}”`); onClose(); navigate('/projects'); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <>
      <div className="modal-body">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <span className="pc-emoji big" style={{ ['--pc' as string]: f.color }}>{f.emoji}</span>
          <div className="field grow">
            <label htmlFor="pname">Name</label>
            <input id="pname" className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Website relaunch" onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          </div>
        </div>
        <div className="field">
          <span className="field-label">Icon</span>
          <div className="emoji-grid">{EMOJIS.map((e) => <button key={e} type="button" className={cx('emoji-btn', f.emoji === e && 'on')} onClick={() => setF({ ...f, emoji: e })} aria-label={`Icon ${e}`} aria-pressed={f.emoji === e}>{e}</button>)}</div>
        </div>
        <div className="field">
          <span className="field-label">Color</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {PROJECT_COLORS.map((c) => <button key={c} type="button" className={cx('swatch', f.color === c && 'on')} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={`Color ${c}`} aria-pressed={f.color === c} />)}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pdesc">Description</label>
          <textarea id="pdesc" className="textarea" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What is this about?" style={{ minHeight: 64 }} />
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button ref={memRef} type="button" className="btn btn-sm" onClick={() => setMemOpen(true)}><AvatarStack members={(f.memberIds ?? []).map((m) => map.get(m))} size={20} max={5} /> Members</button>
          <Popover open={memOpen} onClose={() => setMemOpen(false)} anchor={memRef} label="Members">
            <MemberPicker members={members ?? []} selected={f.memberIds ?? []} onToggle={(id) => setF((x) => ({ ...x, memberIds: x.memberIds?.includes(id) ? x.memberIds.filter((m) => m !== id) : [...(x.memberIds ?? []), id] }))} />
          </Popover>
          <button ref={dueRef} type="button" className="btn btn-sm" onClick={() => setDueOpen(true)}><CalendarClock /> {f.dueAt ? fmtDate(f.dueAt) : 'Target date'}</button>
          <Popover open={dueOpen} onClose={() => setDueOpen(false)} anchor={dueRef} label="Target date">
            <DuePicker value={{ dueAt: f.dueAt ?? null, dueAllDay: true }} onChange={(v) => setF({ ...f, dueAt: v.dueAt })} onDone={() => setDueOpen(false)} />
          </Popover>
          {project && (
            <select className="select" style={{ width: 140, height: 30 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })} aria-label="Status">
              <option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option>
            </select>
          )}
        </div>
      </div>
      <div className="modal-foot">
        {project && <button className="btn btn-ghost" onClick={() => void archive()} style={{ marginRight: 'auto' }}><Archive /> Archive</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={() => void save()}>{project ? 'Save' : 'Create'}</button>
      </div>
    </>
  );
}
