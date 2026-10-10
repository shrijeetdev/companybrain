import { useQueryClient } from '@tanstack/react-query';
import { m as motion } from 'motion/react';
import { CalendarClock, ChevronLeft, ChevronRight, MapPin, Plus, Settings2, Trash2, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { Meeting, TaskView } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { qk, useMe, useMeetings, useMemberMap, useMembers, useTasks } from '../api/queries';
import { AvatarStack } from '../components/Avatar';
import { Modal, Popover } from '../components/Overlay';
import { DuePicker } from '../features/tasks/DuePicker';
import { MemberPicker } from '../features/tasks/Pickers';
import { CheckButton } from '../features/tasks/TaskRow';
import { useCompletionToggle } from '../features/tasks/TaskList';
import { useLabels } from '../lib/labels';
import { atTime, DAY, dayIndex, fmtDate, fmtDuration, fmtTime, HOUR, startOfDay, zoned } from '../lib/time';
import { toast } from '../lib/toast';
import { ui } from '../lib/ui';
import { cx, useIsMobile } from '../lib/util';

const START_H = 7;
const END_H = 22;
const ROW = 48;

function weekStart(ts: number): number {
  const d0 = startOfDay(ts);
  const wd = zoned(d0 + 12 * HOUR).weekday; // 0 = Sun
  return startOfDay(d0 - ((wd + 6) % 7) * DAY + 12 * HOUR);
}

export function Calendar() {
  const L = useLabels();
  const mobile = useIsMobile();
  const [anchor, setAnchor] = useState(() => weekStart(Date.now()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => startOfDay(anchor + i * DAY + 12 * HOUR)), [anchor]);
  const from = days[0]!;
  const to = startOfDay(days[6]! + DAY + 12 * HOUR);
  const { data: meetings } = useMeetings(from, to);
  const { data: tasks } = useTasks({ assigneeId: 'me', includeDone: false });
  const [adding, setAdding] = useState<number | null>(null);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const weekTasks = useMemo(() => (tasks ?? []).filter((t) => t.dueAt && t.dueAt >= from && t.dueAt < to), [tasks, from, to]);
  const label = `${fmtDate(from, { month: 'short', day: 'numeric' })} – ${fmtDate(days[6]!, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return (
    <>
      <div className="page-head">
        <div><h1>{L.calendar}</h1><div className="sub">{label}</div></div>
        <div className="actions">
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" aria-label="Previous week" onClick={() => setAnchor((a) => weekStart(a - 3 * DAY))}><ChevronLeft /></button>
            <button className="btn btn-sm" onClick={() => setAnchor(weekStart(Date.now()))}>This week</button>
            <button className="icon-btn" aria-label="Next week" onClick={() => setAnchor((a) => weekStart(a + 8 * DAY))}><ChevronRight /></button>
          </div>
          <Link href="/settings/calendar" className="btn btn-sm btn-ghost"><Settings2 /> Feeds</Link>
          <button className="btn btn-primary" onClick={() => setAdding(Date.now())}><Plus /> Add {L.meeting.toLowerCase()}</button>
        </div>
      </div>
      {mobile ? <Agenda days={days} meetings={meetings ?? []} tasks={weekTasks} onMeeting={setSelected} />
        : <WeekGrid days={days} meetings={meetings ?? []} tasks={weekTasks} onMeeting={setSelected} onSlot={(ts) => setAdding(ts)} />}
      <MeetingModal open={adding !== null} at={adding ?? Date.now()} onClose={() => setAdding(null)} />
      <MeetingDetail meeting={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function WeekGrid({ days, meetings, tasks, onMeeting, onSlot }: { days: number[]; meetings: Meeting[]; tasks: TaskView[]; onMeeting: (m: Meeting) => void; onSlot: (ts: number) => void }) {
  const members = useMemberMap();
  const scroller = useRef<HTMLDivElement>(null);
  const { toggle } = useCompletionToggle();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  useEffect(() => { const h = zoned(Date.now()).hour; scroller.current?.scrollTo({ top: Math.max(0, (h - START_H - 1) * ROW) }); }, []);
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const minutesFrom = (ts: number) => { const z = zoned(ts); return (z.hour - START_H) * 60 + z.minute; };
  return (
    <div className="panel cal">
      <div className="cal-head">
        <span />
        {days.map((d) => (
          <div key={d} className={cx('cal-day', dayIndex(d) === 0 && 'is-today')}>
            <span className="eyebrow">{fmtDate(d, { weekday: 'short' })}</span>
            <b className="num-display">{zoned(d + 12 * HOUR).day}</b>
          </div>
        ))}
      </div>
      <div className="cal-allday">
        <span className="eyebrow" style={{ alignSelf: 'center', textAlign: 'right', paddingRight: 8 }}>All day</span>
        {days.map((d) => (
          <div key={d} className="cal-allday-cell">
            {tasks.filter((t) => t.dueAllDay && dayIndex(t.dueAt!, d) === 0).map((t) => (
              <button key={t.id} className={cx('cal-task', t.isOverdue && 'over')} onClick={() => ui.openTask(t.id)} title={t.title}>{t.title}</button>
            ))}
          </div>
        ))}
      </div>
      <div className="cal-body" ref={scroller}>
        <div className="cal-grid" style={{ height: hours.length * ROW }}>
          <div className="cal-hours">{hours.map((h) => <span key={h} style={{ top: (h - START_H) * ROW }}>{fmtTime(atTime(days[0]!, h))}</span>)}</div>
          {days.map((d) => {
            const dm = meetings.filter((m) => !m.allDay && dayIndex(m.startAt, d) === 0);
            const dt = tasks.filter((t) => !t.dueAllDay && t.dueAt && dayIndex(t.dueAt, d) === 0);
            return (
              <div key={d} className={cx('cal-col', dayIndex(d) === 0 && 'is-today')}
                onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const mins = Math.round(((e.clientY - r.top) / ROW) * 60 / 30) * 30; onSlot(atTime(d, START_H + Math.floor(mins / 60), mins % 60)); }}>
                {hours.map((h) => <i key={h} className="cal-line" style={{ top: (h - START_H) * ROW }} />)}
                {dm.map((m, i) => {
                  const top = (minutesFrom(m.startAt) / 60) * ROW;
                  const h = Math.max(22, ((m.endAt - m.startAt) / HOUR) * ROW - 3);
                  return (
                    <motion.button key={m.id} className="cal-mtg" style={{ top, height: h }} onClick={() => onMeeting(m)} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                      <b className="truncate">{m.title}</b>
                      {h > 34 && <span>{fmtTime(m.startAt)}–{fmtTime(m.endAt)}</span>}
                      {h > 60 && <AvatarStack members={m.attendeeIds.map((a) => members.get(a))} size={18} max={4} />}
                    </motion.button>
                  );
                })}
                {dt.map((t) => (
                  <div key={t.id} className={cx('cal-due', t.isOverdue && 'over')} style={{ top: (minutesFrom(t.dueAt!) / 60) * ROW - 11 }}>
                    <CheckButton task={t} onToggle={(el) => toggle(t, el)} />
                    <button className="truncate" onClick={() => ui.openTask(t.id)}>{t.title}</button>
                  </div>
                ))}
                {dayIndex(d) === 0 && zoned(now).hour >= START_H && zoned(now).hour < END_H && <div className="cal-now" style={{ top: (minutesFrom(now) / 60) * ROW }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Agenda({ days, meetings, tasks, onMeeting }: { days: number[]; meetings: Meeting[]; tasks: TaskView[]; onMeeting: (m: Meeting) => void }) {
  const L = useLabels();
  const { toggle } = useCompletionToggle();
  return (
    <div className="stack">
      {days.map((d) => {
        const items = [
          ...meetings.filter((m) => dayIndex(m.startAt, d) === 0).map((m) => ({ at: m.startAt, m })),
          ...tasks.filter((t) => dayIndex(t.dueAt!, d) === 0).map((t) => ({ at: t.dueAllDay ? d : t.dueAt!, t })),
        ].sort((a, b) => a.at - b.at);
        return (
          <section key={d} className="panel agenda-day">
            <div className={cx('agenda-head', dayIndex(d) === 0 && 'is-today')}><b>{fmtDate(d, { weekday: 'long' })}</b><span className="faint">{fmtDate(d, { month: 'short', day: 'numeric' })}</span></div>
            {items.length === 0 && <div className="faint" style={{ padding: '0 16px 14px', fontSize: 13 }}>Nothing scheduled</div>}
            {items.map((it) => 'm' in it && it.m ? (
              <button key={it.m.id} className="agenda-item" onClick={() => onMeeting(it.m!)}>
                <span className="agenda-time num">{fmtTime(it.m.startAt)}</span>
                <span className="agenda-bar mtg" />
                <span className="grow truncate"><b>{it.m.title}</b><span className="faint" style={{ display: 'block', fontSize: 12 }}>{fmtDuration(it.m.endAt - it.m.startAt)}{it.m.location ? ` · ${it.m.location}` : ''}</span></span>
              </button>
            ) : 't' in it && it.t ? (
              <div key={it.t.id} className="agenda-item">
                <span className="agenda-time num">{it.t.dueAllDay ? 'All day' : fmtTime(it.t.dueAt!)}</span>
                <CheckButton task={it.t} onToggle={(el) => toggle(it.t!, el)} />
                <button className="grow truncate" style={{ textAlign: 'left' }} onClick={() => ui.openTask(it.t!.id)}>{it.t.title}<span className="faint" style={{ display: 'block', fontSize: 12 }}>{L.task}</span></button>
              </div>
            ) : null)}
          </section>
        );
      })}
    </div>
  );
}

function MeetingDetail({ meeting, onClose }: { meeting: Meeting | null; onClose: () => void }) {
  const qc = useQueryClient();
  const members = useMemberMap();
  const remove = async () => {
    if (!meeting) return;
    try { await api.meetings.remove(meeting.id); void qc.invalidateQueries({ queryKey: qk.meetingsAll }); void qc.invalidateQueries({ queryKey: qk.briefing }); toast('Meeting removed'); onClose(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Modal open={!!meeting} onClose={onClose} title={meeting?.title ?? ''} icon={<CalendarClock style={{ color: 'var(--accent-2)' }} />} width={480}>
      {meeting && (
        <>
          <div className="modal-body">
            <div className="row" style={{ gap: 8 }}><CalendarClock size={16} className="faint" />{fmtDate(meeting.startAt, { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtTime(meeting.startAt)}–{fmtTime(meeting.endAt)}</div>
            {meeting.location && <div className="row" style={{ gap: 8 }}><MapPin size={16} className="faint" />{meeting.location}</div>}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{meeting.attendeeIds.map((a) => members.get(a)).filter(Boolean).map((m) => <span key={m!.id} className="chip"><AvatarStack members={[m]} size={16} />{m!.name}</span>)}</div>
            {meeting.notes && <p className="muted">{meeting.notes}</p>}
            {meeting.source === 'ics' && <div className="faint" style={{ fontSize: 12 }}>Synced from your calendar feed — edit it there.</div>}
          </div>
          <div className="modal-foot">
            {meeting.source === 'manual' && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => void remove()}><Trash2 /> Delete</button>}
            {meeting.url && <a className="btn btn-primary" href={meeting.url} target="_blank" rel="noopener noreferrer"><Video /> Join</a>}
          </div>
        </>
      )}
    </Modal>
  );
}

function MeetingModal({ open, at, onClose }: { open: boolean; at: number; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New meeting" width={520}>
      {open && <MeetingForm at={at} onClose={onClose} />}
    </Modal>
  );
}

function MeetingForm({ at, onClose }: { at: number; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useMe();
  const { data: members } = useMembers();
  const memberMap = useMemberMap();
  const z = zoned(at);
  const roundedStart = at > Date.now() + HOUR ? atTime(at, z.hour, z.minute >= 30 ? 30 : 0) : atTime(Date.now(), Math.min(21, zoned(Date.now()).hour + 1), 0);
  const [f, setF] = useState({ title: '', start: roundedStart, dur: 30, location: '', url: '', attendees: [me.id] });
  const [dateOpen, setDateOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const dRef = useRef<HTMLButtonElement>(null);
  const wRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const zs = zoned(f.start);
  const save = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      await api.meetings.create({ title: f.title.trim(), startAt: f.start, endAt: f.start + f.dur * 60_000, location: f.location || null, url: f.url || null, attendeeIds: f.attendees });
      void qc.invalidateQueries({ queryKey: qk.meetingsAll });
      void qc.invalidateQueries({ queryKey: qk.briefing });
      toast.success('Meeting added');
      onClose();
    } catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  };
  return (
    <>
      <div className="modal-body">
        <div className="field"><label htmlFor="mt">Title</label><input id="mt" className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Design review" /></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button ref={dRef} className="btn" onClick={() => setDateOpen(true)}><CalendarClock /> {fmtDate(f.start, { weekday: 'short', month: 'short', day: 'numeric' })}</button>
          <input className="input" type="time" style={{ width: 120 }} aria-label="Start time" value={`${String(zs.hour).padStart(2, '0')}:${String(zs.minute).padStart(2, '0')}`}
            onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (Number.isFinite(h) && Number.isFinite(m)) setF({ ...f, start: atTime(f.start, h!, m!) }); }} />
          <select className="select" style={{ width: 130 }} aria-label="Duration" value={f.dur} onChange={(e) => setF({ ...f, dur: Number(e.target.value) })}>
            {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{fmtDuration(d * 60_000)}</option>)}
          </select>
        </div>
        <Popover open={dateOpen} onClose={() => setDateOpen(false)} anchor={dRef} label="Date">
          <DuePicker value={{ dueAt: f.start, dueAllDay: false }} onChange={(v) => v.dueAt && setF({ ...f, start: atTime(v.dueAt, zs.hour, zs.minute) })} onDone={() => setDateOpen(false)} />
        </Popover>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} aria-label="Location" />
          <input className="input" placeholder="Video link" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} aria-label="Video link" />
        </div>
        <button ref={wRef} className="btn" style={{ justifySelf: 'start' }} onClick={() => setWhoOpen(true)}><AvatarStack members={f.attendees.map((a) => memberMap.get(a))} size={20} /> Attendees</button>
        <Popover open={whoOpen} onClose={() => setWhoOpen(false)} anchor={wRef} label="Attendees">
          <MemberPicker members={(members ?? []).filter((m) => m.kind === 'human')} selected={f.attendees} onToggle={(id) => setF((x) => ({ ...x, attendees: x.attendees.includes(id) ? x.attendees.filter((a) => a !== id) : [...x.attendees, id] }))} />
        </Popover>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.title.trim()} onClick={() => void save()}>Add meeting</button>
      </div>
    </>
  );
}

