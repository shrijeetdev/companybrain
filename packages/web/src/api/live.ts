import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { FeedItem, InboxItem, LiveEvent, Member, Notification, TaskActivity } from '@companybrain/types';
import { onReward } from '../lib/gameFx';
import { createStore, useStore } from '../lib/util';
import { flash, isLocalEcho, qk, removeTaskFromCaches, softInvalidate, upsertTaskInCaches } from './queries';

export const liveStatus = createStore<'connecting' | 'live' | 'offline'>('connecting');
export const useLiveStatus = () => useStore(liveStatus);

const EVENT_TYPES: LiveEvent['type'][] = ['task.upserted', 'task.deleted', 'activity', 'project.upserted', 'notification', 'inbox.new', 'member.upserted', 'meeting.upserted', 'game.reward', 'ping'];

export function applyLiveEvent(qc: QueryClient, e: LiveEvent, meId: string): void {
  switch (e.type) {
    case 'task.upserted': {
      const prev = qc.getQueryData<{ updatedAt: number }>(qk.task(e.task.id));
      const known = upsertTaskInCaches(qc, e.task);
      if (!isLocalEcho(e.task.id) && (!known || !prev || prev.updatedAt < e.task.updatedAt)) flash(e.task.id);
      // Lists are filtered server-side; refetch so new/moved tasks land in the right views.
      softInvalidate(qc, qk.tasksAll, 600);
      softInvalidate(qc, qk.briefing, 1200);
      softInvalidate(qc, qk.projects, 1500);
      softInvalidate(qc, qk.game.hud, 900);
      break;
    }
    case 'task.deleted':
      removeTaskFromCaches(qc, e.taskId);
      softInvalidate(qc, qk.briefing, 1200);
      break;
    case 'activity':
      qc.setQueryData<TaskActivity[]>(qk.activity(e.activity.taskId), (old) => (old && !old.some((a) => a.id === e.activity.id) ? [...old, e.activity] : old));
      break;
    case 'project.upserted':
      softInvalidate(qc, qk.projects, 300);
      break;
    case 'notification':
      if (e.notification.memberId !== meId) break;
      qc.setQueryData<Notification[]>(qk.notifications, (old) => (old && !old.some((n) => n.id === e.notification.id) ? [e.notification, ...old] : old));
      qc.setQueryData<{ unread: number }>(qk.notifCount, (old) => ({ unread: (old?.unread ?? 0) + 1 }));
      break;
    case 'inbox.new':
      qc.setQueriesData<InboxItem[]>({ queryKey: ['inbox'] }, (old) => (old && !old.some((i) => i.id === e.item.id) ? [e.item, ...old] : old));
      flash(e.item.id, 4000);
      softInvalidate(qc, qk.briefing, 1200);
      break;
    case 'member.upserted':
      qc.setQueryData<Member[]>(qk.members, (old) => (old ? (old.some((m) => m.id === e.member.id) ? old.map((m) => (m.id === e.member.id ? e.member : m)) : [...old, e.member]) : old));
      break;
    case 'meeting.upserted':
      softInvalidate(qc, qk.meetingsAll, 300);
      softInvalidate(qc, qk.briefing, 1200);
      break;
    case 'game.reward': {
      const r = e.reward;
      if (r.memberId === meId) {
        onReward(r);
        softInvalidate(qc, qk.game.hud, 250);
        if (r.kind === 'crate_earned') softInvalidate(qc, qk.game.crates, 250);
      }
      // Everyone's rewards feed the squad feed + leaderboard.
      if (['mission_complete', 'level_up', 'squad_bonus', 'achievement', 'challenge'].includes(r.kind)) {
        qc.setQueryData<FeedItem[]>(qk.game.feed, (old) => {
          if (!old || old.some((f) => f.id === r.id)) return old;
          return [{ id: r.id, memberId: r.memberId, kind: r.kind, xp: r.xp, text: r.label, at: r.at }, ...old].slice(0, 40);
        });
        softInvalidate(qc, ['game', 'leaderboard'], 2000);
      }
      break;
    }
    case 'ping':
      break;
  }
}

/** One EventSource per signed-in session; reconnects with backoff. */
export function useLiveStream(meId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!meId || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const handle = (ev: MessageEvent<string>) => {
      try {
        const e = JSON.parse(ev.data) as LiveEvent;
        if (e && typeof e === 'object' && 'type' in e) applyLiveEvent(qc, e, meId);
      } catch { /* ignore malformed */ }
    };
    const connect = () => {
      liveStatus.set('connecting');
      es = new EventSource('/api/stream', { withCredentials: true });
      es.onopen = () => {
        retry = 0;
        liveStatus.set('live');
      };
      es.onmessage = handle;
      // Servers may also send named events (`event: task.upserted`).
      for (const t of EVENT_TYPES) es.addEventListener(t, handle as EventListener);
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) {
          liveStatus.set('offline');
          es.close();
          if (closed) return;
          // Could be a 401 — re-check the session, then retry with backoff.
          void qc.invalidateQueries({ queryKey: qk.auth });
          timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
        } else {
          liveStatus.set('connecting');
        }
      };
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && es?.readyState === EventSource.CLOSED) { window.clearTimeout(timer); connect(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [meId, qc]);
}
