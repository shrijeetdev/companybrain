import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { ArrowRight, CalendarClock, Check, Flag, Folder, Sparkles, Users, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { InboxItem, Priority, TaskDraft } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { flash, markLocal, qk, useFlash, useInbox, useMemberMap, useMembers, useProjects } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { ChannelIcon, PriorityIcon } from '../components/icons';
import { Popover } from '../components/Overlay';
import { Empty, Segmented, SkeletonRows } from '../components/ui';
import { DuePicker } from '../features/tasks/DuePicker';
import { MemberPicker, PriorityMenu, ProjectMenu } from '../features/tasks/Pickers';
import { missionDeployed } from '../lib/gameFx';
import { priorityLabel, useLabels } from '../lib/labels';
import { ago, fmtDue } from '../lib/time';
import { toast } from '../lib/toast';
import { ui } from '../lib/ui';
import { cx } from '../lib/util';

export function Inbox() {
  const L = useLabels();
  const [tab, setTab] = useState<'new' | 'converted' | 'dismissed'>('new');
  const { data, isLoading } = useInbox(tab);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{L.inbox}</h1>
          <div className="sub">Messages to your WhatsApp & email intake that need a human decision.</div>
        </div>
        <div className="actions">
          <Segmented label="Filter" value={tab} onChange={setTab} options={[{ value: 'new', label: 'New' }, { value: 'converted', label: 'Converted' }, { value: 'dismissed', label: 'Dismissed' }]} />
        </div>
      </div>
      {isLoading ? <div className="panel"><SkeletonRows n={4} /></div> : (
        <div className="inbox-list">
          <AnimatePresence initial={false}>
            {data?.map((it) => <InboxCard key={it.id} item={it} />)}
          </AnimatePresence>
          {data?.length === 0 && (
            <div className="panel">
              <Empty art={tab === 'new' ? '📭' : '🗂️'} title={tab === 'new' ? `${L.inbox} zero` : 'Nothing here'}>
                {tab === 'new' ? 'Every message has been triaged. New WhatsApp and email messages land here live.' : 'Items you handle will show up here.'}
              </Empty>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function InboxCard({ item }: { item: InboxItem }) {
  const L = useLabels();
  const qc = useQueryClient();
  const members = useMemberMap();
  const fl = useFlash(item.id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const matched = item.memberId ? members.get(item.memberId) : undefined;
  const s = item.suggestion;
  const remove = () => qc.setQueriesData<InboxItem[]>({ queryKey: ['inbox'] }, (old) => old?.filter((x) => x.id !== item.id));
  const convert = async (draft?: Partial<TaskDraft>) => {
    setBusy(true);
    try {
      const t = await api.inbox.convert(item.id, draft);
      markLocal(t.id);
      remove();
      missionDeployed();
      flash(t.id);
      toast.success(<>Created “{t.title}”</>, { label: 'Open', onClick: () => ui.openTask(t.id) });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      void qc.invalidateQueries({ queryKey: qk.tasksAll });
      void qc.invalidateQueries({ queryKey: qk.briefing });
    } catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  };
  const dismiss = async () => {
    remove();
    try { await api.inbox.dismiss(item.id); toast('Dismissed', { action: undefined }); void qc.invalidateQueries({ queryKey: ['inbox'] }); }
    catch (e) { toast.error(errorMessage(e)); void qc.invalidateQueries({ queryKey: ['inbox'] }); }
  };
  return (
    <m.article layout className={cx('panel inbox-card', fl && 'flash', `ch-${item.channel}`)} initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}>
      <div className="ib-head">
        <span className={cx('ch-icon', item.channel)}><ChannelIcon channel={item.channel} size={16} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <b>{item.fromName ?? item.from}</b>
            <span className="faint" style={{ fontSize: 12 }}>{item.from}</span>
            {matched && <span className="chip tone-success" style={{ height: 20 }}><Avatar member={matched} size={14} /> On your team</span>}
          </div>
          {item.subject && <div className="ib-subject">{item.subject}</div>}
        </div>
        <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(item.receivedAt)}</span>
      </div>
      <p className="ib-text">{item.text}</p>
      {item.status === 'new' && (
        editing ? <DraftEditor item={item} busy={busy} onCancel={() => setEditing(false)} onSave={(d) => void convert(d)} /> : (
          <div className="ib-foot">
            {s ? (
              <div className="suggestion">
                <Sparkles size={15} className="sg-icon" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="eyebrow">Suggested {L.taskLower}</div>
                  <div className="sg-title">{s.title}</div>
                  <div className="sg-meta">
                    {s.dueAt && <span><CalendarClock size={12} />{fmtDue(s.dueAt, !!s.dueAllDay)}</span>}
                    {s.priority && s.priority !== 'none' && <span><PriorityIcon priority={s.priority} size={12} />{priorityLabel(s.priority)}</span>}
                    {s.assigneeIds?.map((a) => members.get(a)).filter(Boolean).map((m) => <span key={m!.id}><Avatar member={m} size={16} />{m!.name.split(' ')[0]}</span>)}
                  </div>
                </div>
              </div>
            ) : <div className="faint grow" style={{ fontSize: 13 }}>No suggestion — create one from the message.</div>}
            <div className="row ib-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => void dismiss()}><X /> Dismiss</button>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void convert()}><Check /> {L.addVerb} {L.taskLower}</button>
            </div>
          </div>
        )
      )}
      {item.status === 'converted' && item.taskId && <button className="btn btn-sm" onClick={() => ui.openTask(item.taskId!)}>Open {L.taskLower} <ArrowRight /></button>}
    </m.article>
  );
}

function DraftEditor({ item, busy, onSave, onCancel }: { item: InboxItem; busy: boolean; onSave: (d: Partial<TaskDraft>) => void; onCancel: () => void }) {
  const L = useLabels();
  const { data: members } = useMembers();
  const { data: projects } = useProjects();
  const memberMap = useMemberMap();
  const s = item.suggestion;
  const [d, setD] = useState<TaskDraft>({ title: s?.title ?? item.subject ?? item.text.slice(0, 80), dueAt: s?.dueAt ?? null, dueAllDay: s?.dueAllDay ?? false, priority: s?.priority ?? 'none', assigneeIds: s?.assigneeIds ?? [], projectId: s?.projectId ?? null, notes: s?.notes ?? `From ${item.fromName ?? item.from}: “${item.text}”` });
  const [open, setOpen] = useState<null | 'due' | 'who' | 'pri' | 'proj'>(null);
  const refs = { due: useRef<HTMLButtonElement>(null), who: useRef<HTMLButtonElement>(null), pri: useRef<HTMLButtonElement>(null), proj: useRef<HTMLButtonElement>(null) };
  const proj = projects?.find((p) => p.id === d.projectId);
  return (
    <m.div className="draft" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
      <input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Title" autoFocus />
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button ref={refs.due} className="chip chip-btn chip-lg" onClick={() => setOpen('due')}><CalendarClock />{d.dueAt ? fmtDue(d.dueAt, !!d.dueAllDay) : 'Due date'}</button>
        <button ref={refs.who} className="chip chip-btn chip-lg" onClick={() => setOpen('who')}><Users />{d.assigneeIds?.length ? d.assigneeIds.map((a) => memberMap.get(a)?.name.split(' ')[0]).join(', ') : 'Assignee'}</button>
        <button ref={refs.pri} className="chip chip-btn chip-lg" onClick={() => setOpen('pri')}><Flag />{priorityLabel((d.priority ?? 'none') as Priority)}</button>
        <button ref={refs.proj} className="chip chip-btn chip-lg" onClick={() => setOpen('proj')}><Folder />{proj ? `${proj.emoji} ${proj.name}` : L.project}</button>
      </div>
      <Popover open={open === 'due'} onClose={() => setOpen(null)} anchor={refs.due} label="Due"><DuePicker value={{ dueAt: d.dueAt ?? null, dueAllDay: !!d.dueAllDay }} onChange={(v) => setD({ ...d, ...v })} onDone={() => setOpen(null)} /></Popover>
      <Popover open={open === 'who'} onClose={() => setOpen(null)} anchor={refs.who} label="Assignees"><MemberPicker members={members ?? []} selected={d.assigneeIds ?? []} onToggle={(id) => setD((x) => ({ ...x, assigneeIds: x.assigneeIds?.includes(id) ? x.assigneeIds.filter((a) => a !== id) : [...(x.assigneeIds ?? []), id] }))} /></Popover>
      <Popover open={open === 'pri'} onClose={() => setOpen(null)} anchor={refs.pri} label="Priority"><PriorityMenu value={(d.priority ?? 'none') as Priority} onChange={(p) => setD({ ...d, priority: p })} onDone={() => setOpen(null)} /></Popover>
      <Popover open={open === 'proj'} onClose={() => setOpen(null)} anchor={refs.proj} label={L.project}><ProjectMenu projects={projects ?? []} value={d.projectId ?? null} onChange={(id) => setD({ ...d, projectId: id })} onDone={() => setOpen(null)} /></Popover>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy || !d.title.trim()} onClick={() => onSave(d)}><Check /> Create {L.taskLower}</button>
      </div>
    </m.div>
  );
}
