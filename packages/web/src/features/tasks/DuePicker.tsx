import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, atTime, DAY, fmtDate, fmtTime, fromWall, startOfDay, zoned } from '../../lib/time';
import { cx } from '../../lib/util';

export interface DueValue { dueAt: number | null; dueAllDay: boolean }

const TIMES: [number, number][] = [[9, 0], [12, 0], [15, 0], [17, 0], [18, 0], [21, 0]];

/** Custom due-date picker: quick chips, month grid, time chips + exact time. */
export function DuePicker({ value, onChange, onDone }: { value: DueValue; onChange: (v: DueValue) => void; onDone?: () => void }) {
  const now = Date.now();
  const today0 = startOfDay(now);
  const [cursor, setCursor] = useState(() => {
    const z = zoned(value.dueAt ?? now);
    return { y: z.year, m: z.month };
  });
  const selDay = value.dueAt ? startOfDay(value.dueAt) : null;
  const selTime = value.dueAt && !value.dueAllDay ? zoned(value.dueAt) : null;

  const set = (day: number, time: [number, number] | null) => {
    onChange(time ? { dueAt: atTime(day, time[0], time[1]), dueAllDay: false } : { dueAt: atTime(day, 18, 0), dueAllDay: true });
  };
  const nextMonday = () => { const wd = zoned(now).weekday; return addDays(today0 + 12 * 3600_000, ((8 - wd) % 7) || 7); };
  const quick: { label: string; hint: string; day: number }[] = [
    { label: 'Today', hint: fmtDate(now, { weekday: 'short' }), day: today0 + 12 * 3600_000 },
    { label: 'Tomorrow', hint: fmtDate(now + DAY, { weekday: 'short' }), day: today0 + DAY + 12 * 3600_000 },
    { label: 'This weekend', hint: 'Sat', day: addDays(today0 + 12 * 3600_000, ((6 - zoned(now).weekday + 7) % 7) || 7) },
    { label: 'Next week', hint: fmtDate(nextMonday(), { weekday: 'short', day: 'numeric' }), day: nextMonday() },
  ];

  const grid = useMemo(() => {
    const first = Date.UTC(cursor.y, cursor.m - 1, 1, 12);
    const firstWd = new Date(first).getUTCDay();
    const startOffset = (firstWd + 6) % 7; // Monday-first
    const cells: { ts: number; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(Date.UTC(cursor.y, cursor.m - 1, 1 - startOffset + i, 12));
      // the calendar date at midday in the member's timezone
      const ts = fromWall(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0);
      cells.push({ ts, day: d.getUTCDate(), inMonth: d.getUTCMonth() === cursor.m - 1 });
    }
    return cells;
  }, [cursor]);

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(cursor.y, cursor.m - 1, 15));
  const curDay = selDay ?? today0 + 12 * 3600_000;
  const timeStr = selTime ? `${String(selTime.hour).padStart(2, '0')}:${String(selTime.minute).padStart(2, '0')}` : '';

  return (
    <div className="dp">
      <div className="dp-quick">
        {quick.map((q) => (
          <button key={q.label} onClick={() => { set(q.day, selTime ? [selTime.hour, selTime.minute] : null); onDone?.(); }}>
            {q.label}<span>{q.hint}</span>
          </button>
        ))}
      </div>
      <div>
        <div className="dp-month">
          <button className="icon-btn icon-btn-sm" aria-label="Previous month" onClick={() => setCursor((c) => (c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }))}><ChevronLeft /></button>
          <span>{monthLabel}</span>
          <button className="icon-btn icon-btn-sm" aria-label="Next month" onClick={() => setCursor((c) => (c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }))}><ChevronRight /></button>
        </div>
        <div className="dp-grid" role="grid" aria-label={monthLabel}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
          {grid.map((c) => {
            const d0 = startOfDay(c.ts);
            return (
              <button key={c.ts} className={cx(!c.inMonth && 'muted', d0 === today0 && 'today', selDay === d0 && 'sel')}
                aria-label={fmtDate(c.ts, { weekday: 'long', month: 'long', day: 'numeric' })} aria-selected={selDay === d0}
                onClick={() => set(c.ts, selTime ? [selTime.hour, selTime.minute] : null)}>
                {c.day}
              </button>
            );
          })}
        </div>
      </div>
      <div className="dp-times">
        <button className={cx('chip chip-btn', value.dueAt !== null && value.dueAllDay && 'active')} onClick={() => set(curDay, null)}>All day</button>
        {TIMES.map(([h, m]) => (
          <button key={h} className={cx('chip chip-btn', selTime?.hour === h && selTime.minute === m && 'active')} onClick={() => set(curDay, [h, m])}>
            {fmtTime(atTime(today0, h, m))}
          </button>
        ))}
        <input className="input" type="time" aria-label="Exact time" style={{ height: 32, width: 120 }} value={timeStr}
          onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (Number.isFinite(h) && Number.isFinite(m)) set(curDay, [h!, m!]); }} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => { onChange({ dueAt: null, dueAllDay: false }); onDone?.(); }}><X /> Clear</button>
        <button className="btn btn-primary btn-sm" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
