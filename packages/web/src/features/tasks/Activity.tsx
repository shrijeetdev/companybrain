import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { AlarmClock, ArrowRightLeft, Bell, CalendarClock, CircleDot, Flag, FolderInput, Handshake, ListChecks, Pencil, Plus, Send, UserPlus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ActivityKind, Member, TaskActivity, TaskView } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk, useActivity, useMemberMap, useMembers } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { SkeletonRows } from '../../components/ui';
import { renderInline } from '../../lib/markdown';
import { ago } from '../../lib/time';
import { toast } from '../../lib/toast';
import { cx, firstName } from '../../lib/util';

const SYS_ICON: Partial<Record<ActivityKind, React.ReactNode>> = {
  created: <Plus />, status: <CircleDot />, assigned: <UserPlus />, unassigned: <UserPlus />, due_changed: <CalendarClock />, priority: <Flag />,
  edited: <Pencil />, subtask: <ListChecks />, moved_project: <FolderInput />, reminder_sent: <AlarmClock />, nudge_sent: <Bell />, attachment: <ArrowRightLeft />,
};

function ActivityItem({ a, actor, isMention }: { a: TaskActivity; actor: Member | undefined; isMention: (n: string) => boolean }) {
  const isText = a.kind === 'comment' || a.kind === 'handoff';
  const name = a.actorId === 'system' ? 'companybrain' : actor?.name ?? 'Someone';
  return (
    <m.li className="tl-item" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="tl-line" />
      {isText ? <Avatar member={actor} size={28} /> : <span className="tl-sysicon">{SYS_ICON[a.kind] ?? <CircleDot />}</span>}
      <div className="grow" style={{ minWidth: 0 }}>
        {isText ? (
          <>
            <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13 }}>{name}</b>
              {a.kind === 'handoff' && <span className="handoff-tag"><Handshake size={12} /> Handoff</span>}
              <span className="tl-time">{ago(a.at)}</span>
            </div>
            <div className={cx('tl-bubble', a.kind === 'handoff' && 'handoff')}>{renderInline(a.text, isMention)}</div>
          </>
        ) : (
          <div className="tl-event"><b>{a.actorId === 'system' ? 'companybrain' : firstName(name)}</b> {a.text}<span className="tl-time">{ago(a.at)}</span></div>
        )}
      </div>
    </m.li>
  );
}

export function ActivityTimeline({ task }: { task: TaskView }) {
  const { data, isLoading } = useActivity(task.id);
  const members = useMemberMap();
  const names = useMemo(() => new Set([...members.values()].map((m) => firstName(m.name).toLowerCase())), [members]);
  const isMention = (n: string) => names.has(n.toLowerCase());
  if (isLoading) return <SkeletonRows n={3} />;
  return (
    <ul className="timeline">
      <AnimatePresence initial={false}>
        {data?.map((a) => <ActivityItem key={a.id} a={a} actor={members.get(a.actorId)} isMention={isMention} />)}
      </AnimatePresence>
    </ul>
  );
}

/** Comment box with @mention autocomplete and a "handoff" mode. */
export function Composer({ task }: { task: TaskView }) {
  const qc = useQueryClient();
  const { data: members } = useMembers();
  const [text, setText] = useState('');
  const [handoff, setHandoff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const suggestions = useMemo(() => (mention ? (members ?? []).filter((m) => m.active && m.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, 6) : []), [mention, members]);

  const detect = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\p{L}\d_.-]*)$/u.exec(before);
    setMention(m ? { q: m[2]!, start: caret - m[2]!.length - 1 } : null);
    setActive(0);
  };
  const pick = (m: Member) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const name = firstName(m.name);
    const next = `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => { const pos = mention.start + name.length + 2; ref.current?.setSelectionRange(pos, pos); ref.current?.focus(); });
  };
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const a = await api.tasks.comment(task.id, t, handoff ? 'handoff' : 'comment');
      qc.setQueryData<TaskActivity[]>(qk.activity(task.id), (old) => (old && !old.some((x) => x.id === a.id) ? [...old, a] : old));
      setText('');
      setHandoff(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer" style={{ position: 'relative' }}>
      <AnimatePresence>
        {mention && suggestions.length > 0 && (
          <m.div className="popover mention-pop" style={{ position: 'absolute' }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="listbox" aria-label="Mention someone">
            {suggestions.map((m, i) => (
              <button key={m.id} className="menu-item" role="option" aria-selected={i === active} data-active={i === active} onMouseDown={(e) => { e.preventDefault(); pick(m); }}>
                <Avatar member={m} size={22} /><span className="grow">{m.name}</span>{m.kind === 'agent' && <span className="faint" style={{ fontSize: 11 }}>agent</span>}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
      <div className="composer-box">
        <textarea
          ref={ref}
          className="textarea"
          rows={1}
          value={text}
          placeholder={handoff ? 'Handoff note — what’s done, what’s next, what’s blocking…' : 'Comment, or @mention someone…'}
          aria-label="Comment"
          onChange={(e) => { setText(e.target.value); detect(e.target.value, e.target.selectionStart); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
          onKeyDown={(e) => {
            if (mention && suggestions.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[active]!); return; }
              if (e.key === 'Escape') { e.stopPropagation(); setMention(null); return; }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
          }}
        />
        <button className="btn btn-primary" style={{ height: 40 }} onClick={() => void send()} disabled={!text.trim() || busy} aria-label="Send"><Send /></button>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button className={cx('chip chip-btn', handoff && 'active')} aria-pressed={handoff} onClick={() => setHandoff((h) => !h)}><Handshake /> Handoff note</button>
        <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>⌘↵ to send</span>
      </div>
    </div>
  );
}
