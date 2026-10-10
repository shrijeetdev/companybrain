import { AnimatePresence, motion } from 'motion/react';
import { AlarmClock, AtSign, CalendarClock, CornerDownLeft, Flag, Hash, Plus, Repeat, Send, TriangleAlert } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CreateTaskInput, ParsedQuickAdd, Recurrence } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api, type Preview } from '../../api/endpoints';
import { flash, useMe, useMemberMap, useProjectMap } from '../../api/queries';
import { Spinner } from '../../components/ui';
import { priorityLabel, useLabels } from '../../lib/labels';
import { sfx } from '../../lib/sfx';
import { useTheme } from '../../lib/theme';
import { fmtDue } from '../../lib/time';
import { toast } from '../../lib/toast';
import { cx, useDebounced, useIsMobile } from '../../lib/util';
import { useTaskActions } from './actions';

export function recurrenceText(r: Recurrence): string {
  const every = r.interval > 1 ? `Every ${r.interval} ` : 'Every ';
  if (r.freq === 'weekdays') return 'Every weekday';
  if (r.freq === 'weekly' && r.byWeekday?.length) return `${every}${r.byWeekday.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  return r.interval > 1 ? `${every}${unit}s` : `${every}${unit}`;
}
export function offsetText(min: number): string {
  if (min === 0) return 'at due time';
  if (min % 1440 === 0) return `${min / 1440}d before`;
  if (min % 60 === 0) return `${min / 60}h before`;
  return `${min}m before`;
}

const KIND_ICON: Record<ParsedQuickAdd['tokens'][number]['kind'], ReactNode> = {
  date: <CalendarClock />, assignee: <AtSign />, project: <Hash />, priority: <Flag />, tag: <Hash />, recurrence: <Repeat />, reminder: <AlarmClock />,
};

export interface QuickAddHandle { focus: () => void }

interface Props { defaults?: Partial<CreateTaskInput>; autoFocus?: boolean; onCreated?: () => void; compact?: boolean }

export const QuickAdd = forwardRef<QuickAddHandle, Props>(function QuickAdd({ defaults, autoFocus, onCreated, compact }, ref) {
  const L = useLabels();
  const { tactical } = useTheme();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const members = useMemberMap();
  const me = useMe();
  const projects = useProjectMap();
  const { quickAdd } = useTaskActions();
  const debounced = useDebounced(text, 150);
  const mobile = useIsMobile();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  useEffect(() => {
    const t = debounced.trim();
    if (!t) { setPreview(null); return; }
    let live = true;
    api.tasks.preview(t).then((p) => { if (live) setPreview(p); }).catch(() => { /* preview is best-effort */ });
    return () => { live = false; };
  }, [debounced]);

  // Keep the token highlight layer scrolled exactly like the input (typing auto-scrolls without a scroll event).
  useEffect(() => {
    const id = requestAnimationFrame(() => { if (hlRef.current && inputRef.current) hlRef.current.scrollLeft = inputRef.current.scrollLeft; });
    return () => cancelAnimationFrame(id);
  });

  const tokens = text.trim() && preview && debounced.trim() === text.trim() ? preview.parsed.tokens : [];
  const offset = text.length - text.trimStart().length;

  const chips = useMemo(() => {
    if (!preview || !text.trim()) return [];
    const d = preview.draft;
    const out: { key: string; cls: string; icon: ReactNode; label: string }[] = [];
    if (d.dueAt) out.push({ key: 'date', cls: 'tk-date', icon: KIND_ICON.date, label: fmtDue(d.dueAt, !!d.dueAllDay) });
    for (const id of d.assigneeIds ?? []) { const m = members.get(id); if (m) out.push({ key: `a${id}`, cls: 'tk-assignee', icon: KIND_ICON.assignee, label: m.name }); }
    if (d.projectId) { const p = projects.get(d.projectId); if (p) out.push({ key: 'p', cls: 'tk-project', icon: <span>{p.emoji}</span>, label: p.name }); }
    if (d.priority && d.priority !== 'none') out.push({ key: 'pr', cls: 'tk-priority', icon: KIND_ICON.priority, label: priorityLabel(d.priority) });
    if (d.recurrence) out.push({ key: 'r', cls: 'tk-recurrence', icon: KIND_ICON.recurrence, label: recurrenceText(d.recurrence) });
    for (const o of d.reminderOffsets ?? []) out.push({ key: `rem${o}`, cls: 'tk-reminder', icon: KIND_ICON.reminder, label: `Remind ${offsetText(o)}` });
    for (const t of d.tags ?? []) out.push({ key: `t${t}`, cls: 'tk-tag', icon: KIND_ICON.tag, label: t });
    for (const u of preview.unresolved) out.push({ key: `u${u}`, cls: 'tk-unresolved', icon: <TriangleAlert />, label: `${u} not found` });
    return out;
  }, [preview, text, members, projects]);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const task = await quickAdd(t, defaults);
      setText('');
      setPreview(null);
      flash(task.id, 2200);
      // A mission deployed to someone else drops out of "Mine" — say where it went.
      if (!task.assigneeIds.includes(me.id)) {
        const names = task.assigneeIds.map((id) => members.get(id)?.name ?? 'teammate').join(', ');
        toast.success(`${L.addVerb === 'Deploy' ? 'Deployed' : 'Added'} “${task.title}” → ${names || 'unassigned'}`);
      }
      onCreated?.();
    } catch (e) {
      sfx.error();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const hl = useMemo(() => {
    if (!tokens.length) return null;
    const parts: ReactNode[] = [];
    let i = 0;
    const sorted = [...tokens].sort((a, b) => a.start - b.start);
    for (const tk of sorted) {
      const s = tk.start + offset;
      const e = tk.end + offset;
      if (s < i) continue;
      parts.push(text.slice(i, s));
      parts.push(<mark key={s} className={`tk-${tk.kind}`}>{text.slice(s, e)}</mark>);
      i = e;
    }
    parts.push(text.slice(i));
    return parts;
  }, [tokens, text, offset]);

  return (
    <div className={cx('quickadd panel', compact && 'compact')} data-focused={focused}>
      <div className="quickadd-row">
        <span className="quickadd-icon" aria-hidden>{busy ? <Spinner size={15} /> : tactical ? <Send /> : <Plus strokeWidth={2.6} />}</span>
        {tactical && <span className="prompt" aria-hidden>&gt;</span>}
        <div className="quickadd-input-wrap">
          <div ref={hlRef} className="quickadd-hl" aria-hidden>{hl}</div>
          <input
            ref={inputRef}
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onScroll={(e) => { if (hlRef.current) hlRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
              if (e.key === 'Escape') { if (text) { e.stopPropagation(); setText(''); } else inputRef.current?.blur(); }
            }}
            placeholder={compact || mobile ? L.addShort : L.addPlaceholder}
            aria-label={L.newTask}
            enterKeyHint="send"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {text.trim() ? (
          <button className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={busy}>{L.addVerb}</button>
        ) : (
          <span className="quickadd-hint"><CornerDownLeft size={13} /> to {L.addVerb.toLowerCase()} · <kbd className="kbd">N</kbd></span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {chips.length > 0 && (
          <motion.div className="quickadd-chips" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}>
            <AnimatePresence initial={false} mode="popLayout">
              {chips.map((c) => (
                <motion.span key={c.key} layout className={cx('chip token-chip', c.cls)} initial={{ opacity: 0, scale: 0.7, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ type: 'spring', stiffness: 600, damping: 28 }}>
                  {c.icon}{c.label}
                </motion.span>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
