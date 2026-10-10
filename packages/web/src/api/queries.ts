import { keepPreviousData, QueryClient, useQuery, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Briefing, Leaderboard, Member, ProjectSummary, TaskQuery, TaskView } from '@companybrain/types';
import { api } from './endpoints';
import { createStore, useStore } from '../lib/util';

// ─── Query keys (one place, hierarchical so invalidation is easy) ───────────

export const qk = {
  auth: ['auth'] as const,
  briefing: ['briefing'] as const,
  tasksAll: ['tasks'] as const,
  tasks: (q: TaskQuery) => ['tasks', normalize(q)] as const,
  task: (id: string) => ['task', id] as const,
  activity: (id: string) => ['activity', id] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  members: ['members'] as const,
  membersAll: ['members', 'all'] as const,
  notifications: ['notifications', 'list'] as const,
  notifCount: ['notifications', 'count'] as const,
  inbox: (status?: string) => ['inbox', status ?? 'all'] as const,
  meetings: (from: number, to: number) => ['meetings', from, to] as const,
  meetingsAll: ['meetings'] as const,
  feeds: ['feeds'] as const,
  leads: ['leads'] as const,
  reports: (days: number) => ['reports', days] as const,
  audit: ['audit'] as const,
  org: ['org'] as const,
  keys: (memberId?: string) => ['keys', memberId ?? 'all'] as const,
  integrations: ['integrations'] as const,
  search: (q: string) => ['search', q] as const,
  game: {
    all: ['game'] as const,
    hud: ['game', 'hud'] as const,
    profile: (id: string) => ['game', 'profile', id] as const,
    leaderboard: (p: Leaderboard['period']) => ['game', 'leaderboard', p] as const,
    achievements: (id: string) => ['game', 'achievements', id] as const,
    challenges: ['game', 'challenges'] as const,
    crates: ['game', 'crates'] as const,
    inventory: ['game', 'inventory'] as const,
    feed: ['game', 'feed'] as const,
    rewards: ['game', 'rewards'] as const,
  },
};

function normalize(q: TaskQuery): TaskQuery {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(q).sort()) {
    const v = (q as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out as TaskQuery;
}

export function makeQueryClient(onError: (e: unknown) => void): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        gcTime: 10 * 60_000,
        retry: (n, e) => n < 2 && !(e as { status?: number }).status?.toString().startsWith('4'),
        refetchOnWindowFocus: true,
      },
      mutations: { onError },
    },
  });
}

// ─── Live highlight: ids that just changed (from teammates/agents) ──────────

export const flashStore = createStore<ReadonlySet<string>>(new Set());
export function flash(id: string, ms = 2600): void {
  flashStore.set((s) => new Set(s).add(id));
  window.setTimeout(() => flashStore.set((s) => { const n = new Set(s); n.delete(id); return n; }), ms);
}
/** Tasks this tab just changed itself — live echoes of those shouldn't flash. */
const localEdits = new Map<string, number>();
export function markLocal(id: string): void { localEdits.set(id, Date.now()); }
export function isLocalEcho(id: string): boolean { const t = localEdits.get(id); return !!t && Date.now() - t < 4000; }
export function useFlash(id: string): boolean {
  return useStore(flashStore).has(id);
}

// ─── Cache helpers ──────────────────────────────────────────────────────────

/** Replace the task wherever it is cached. Returns whether any list contained it. */
export function upsertTaskInCaches(qc: QueryClient, task: TaskView): boolean {
  let found = false;
  qc.setQueriesData<TaskView[]>({ queryKey: qk.tasksAll }, (old) => {
    if (!old) return old;
    const i = old.findIndex((t) => t.id === task.id);
    if (i < 0) return old;
    found = true;
    const next = old.slice();
    next[i] = task;
    return next;
  });
  qc.setQueryData(qk.task(task.id), task);
  patchBriefing(qc, (t) => (t.id === task.id ? task : t));
  return found;
}
export function patchTaskInCaches(qc: QueryClient, id: string, patch: Partial<TaskView>): void {
  qc.setQueriesData<TaskView[]>({ queryKey: qk.tasksAll }, (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  qc.setQueryData<TaskView>(qk.task(id), (old) => (old ? { ...old, ...patch } : old));
  patchBriefing(qc, (t) => (t.id === id ? { ...t, ...patch } : t));
}
/** The briefing embeds task lists; keep them in step with optimistic edits. */
function patchBriefing(qc: QueryClient, fn: (t: TaskView) => TaskView): void {
  qc.setQueryData<Briefing>(qk.briefing, (b) => b && {
    ...b,
    myTasks: { overdue: b.myTasks.overdue.map(fn), today: b.myTasks.today.map(fn), upcoming: b.myTasks.upcoming.map(fn) },
    waitingOn: b.waitingOn.map(fn),
  });
}
export function removeTaskFromCaches(qc: QueryClient, id: string): void {
  qc.setQueriesData<TaskView[]>({ queryKey: qk.tasksAll }, (old) => old?.filter((t) => t.id !== id));
  qc.removeQueries({ queryKey: qk.task(id) });
}
export function prependTaskToCaches(qc: QueryClient, task: TaskView, match: (key: QueryKey) => boolean = () => true): void {
  qc.setQueriesData<TaskView[]>({ queryKey: qk.tasksAll, predicate: (q) => match(q.queryKey) }, (old) => (old && !old.some((t) => t.id === task.id) ? [task, ...old] : old));
}

/** Coalesce many invalidations (e.g. a burst of live events) into one refetch. */
const pending = new Map<string, number>();
export function softInvalidate(qc: QueryClient, key: QueryKey, ms = 450): void {
  const k = JSON.stringify(key);
  if (pending.has(k)) return;
  pending.set(k, window.setTimeout(() => { pending.delete(k); void qc.invalidateQueries({ queryKey: key }); }, ms));
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export const useAuth = () => useQuery({ queryKey: qk.auth, queryFn: api.auth.state, staleTime: 60_000, retry: 1 });
export function useMe(): Member {
  const { data } = useAuth();
  if (!data?.member) throw new Error('useMe() outside an authenticated tree');
  return data.member;
}
export const useOrg = () => useQuery({ queryKey: qk.org, queryFn: api.org.get, staleTime: 5 * 60_000 });

export const useMembers = () => useQuery({ queryKey: qk.members, queryFn: () => api.members.list(), staleTime: 60_000 });
export function useMemberMap(): Map<string, Member> {
  const { data } = useMembers();
  return useMemo(() => new Map((data ?? []).map((m) => [m.id, m])), [data]);
}
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.projects.list(), staleTime: 30_000 });
export function useProjectMap(): Map<string, ProjectSummary> {
  const { data } = useProjects();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
}

export const useTasks = (q: TaskQuery, enabled = true) =>
  useQuery({ queryKey: qk.tasks(q), queryFn: ({ signal }) => api.tasks.list(q, signal), placeholderData: keepPreviousData, enabled });
export const useTask = (id: string | null) =>
  useQuery({ queryKey: qk.task(id ?? ''), queryFn: () => api.tasks.get(id!), enabled: !!id });
export const useActivity = (id: string | null) =>
  useQuery({ queryKey: qk.activity(id ?? ''), queryFn: () => api.tasks.activity(id!), enabled: !!id });

export const useBriefing = () => useQuery({ queryKey: qk.briefing, queryFn: api.briefing.get, staleTime: 30_000 });
export const useNotifications = (enabled = true) => useQuery({ queryKey: qk.notifications, queryFn: () => api.notifications.list({ limit: 40 }), enabled });
export const useUnreadCount = () => useQuery({ queryKey: qk.notifCount, queryFn: api.notifications.count, refetchInterval: 120_000 });
export const useInbox = (status?: 'new' | 'converted' | 'dismissed') => useQuery({ queryKey: qk.inbox(status), queryFn: () => api.inbox.list(status) });
export const useMeetings = (from: number, to: number) => useQuery({ queryKey: qk.meetings(from, to), queryFn: () => api.meetings.list(from, to), placeholderData: keepPreviousData });

export const useHud = () => useQuery({ queryKey: qk.game.hud, queryFn: api.game.hud, staleTime: 15_000 });
