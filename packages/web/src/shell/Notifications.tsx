import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { AlarmClock, AtSign, Bell, BellRing, Bot, CalendarClock, CheckCheck, CircleCheck, Flame, Inbox, MessageSquare, Newspaper, TriangleAlert, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import type { Notification, NotificationKind } from '@companybrain/types';
import { api } from '../api/endpoints';
import { qk, useNotifications, useUnreadCount } from '../api/queries';
import { Popover } from '../components/Overlay';
import { Empty, SkeletonRows } from '../components/ui';
import { ago } from '../lib/time';
import { ui } from '../lib/ui';
import { cx } from '../lib/util';

const ICONS: Record<NotificationKind, [React.ReactNode, string]> = {
  task_assigned: [<UserPlus key="i" />, 'var(--info)'],
  task_due_soon: [<AlarmClock key="i" />, 'var(--warning)'],
  task_due_now: [<AlarmClock key="i" />, 'var(--warning)'],
  task_overdue: [<Flame key="i" />, 'var(--danger)'],
  task_escalated: [<TriangleAlert key="i" />, 'var(--danger)'],
  task_comment: [<MessageSquare key="i" />, 'var(--info)'],
  task_mention: [<AtSign key="i" />, 'var(--violet)'],
  task_completed: [<CircleCheck key="i" />, 'var(--success)'],
  agent_stale: [<Bot key="i" />, 'var(--warning)'],
  meeting_soon: [<CalendarClock key="i" />, 'var(--info)'],
  intake_new: [<Inbox key="i" />, 'var(--accent-ink)'],
  digest: [<Newspaper key="i" />, 'var(--text-2)'],
  system: [<Bell key="i" />, 'var(--text-2)'],
};

function openLink(n: Notification, navigate: (to: string) => void): void {
  const link = n.link ?? (n.taskId ? `/tasks/${n.taskId}` : null);
  if (!link) return;
  const m = /^\/tasks\/([^/?#]+)/.exec(link);
  if (m) ui.openTask(m[1]!);
  else navigate(link);
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { data: count } = useUnreadCount();
  const unread = count?.unread ?? 0;
  return (
    <>
      <button ref={ref} className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <m.span key={unread} initial={unread ? { rotate: -18 } : false} animate={{ rotate: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 8 }} style={{ display: 'grid' }}>
          {unread ? <BellRing /> : <Bell />}
        </m.span>
        <AnimatePresence>
          {unread > 0 && (
            <m.span className="badge bell-badge" initial={{ scale: 0 }} animate={{ scale: 0.9 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}>
              {unread > 99 ? '99+' : unread}
            </m.span>
          )}
        </AnimatePresence>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" className="notif-panel" label="Notifications">
        <NotificationList onNavigate={() => setOpen(false)} />
      </Popover>
    </>
  );
}

function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isLoading } = useNotifications();
  const markRead = async (ids: string[] | 'all') => {
    const now = Date.now();
    qc.setQueryData<Notification[]>(qk.notifications, (old) => old?.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)));
    qc.setQueryData<{ unread: number }>(qk.notifCount, (old) => ({ unread: ids === 'all' ? 0 : Math.max(0, (old?.unread ?? 0) - ids.length) }));
    try { await api.notifications.read(ids); } catch { void qc.invalidateQueries({ queryKey: ['notifications'] }); }
  };
  const unread = data?.filter((n) => !n.readAt).length ?? 0;
  return (
    <>
      <div className="notif-head">
        <h3 className="grow">Notifications</h3>
        {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={() => void markRead('all')}><CheckCheck /> Mark all read</button>}
      </div>
      <div className="notif-list">
        {isLoading && <SkeletonRows n={4} />}
        {data?.length === 0 && <Empty art="🔕" title="All quiet">You’re all caught up.</Empty>}
        <AnimatePresence initial={false}>
          {data?.map((n) => {
            const [icon, color] = ICONS[n.kind] ?? ICONS.system;
            return (
              <m.button
                key={n.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cx('notif', !n.readAt && 'unread')}
                onClick={() => { void markRead([n.id]); openLink(n, navigate); onNavigate(); }}
              >
                <span className="n-icon" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{icon}</span>
                <span className="grow" style={{ minWidth: 0, paddingRight: 14 }}>
                  <div className="n-title">{n.title}{n.urgent && <span className="chip tone-danger" style={{ height: 18, marginLeft: 6, fontSize: 10.5 }}>Urgent</span>}</div>
                  {n.body && <div className="n-body">{n.body}</div>}
                  <div className="n-time">{ago(n.createdAt)}</div>
                </span>
              </m.button>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}
