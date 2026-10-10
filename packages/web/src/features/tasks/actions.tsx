import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CreateTaskInput, Hud, TaskView, UpdateTaskInput } from '@companybrain/types';
import { api } from '../../api/endpoints';
import { markLocal, patchTaskInCaches, prependTaskToCaches, qk, removeTaskFromCaches, upsertTaskInCaches } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { maybeSectorCleared, missionDeployed, missionHit } from '../../lib/gameFx';
import { useLabels } from '../../lib/labels';
import { sfx } from '../../lib/sfx';
import { startOfDay } from '../../lib/time';
import { toast } from '../../lib/toast';

function centerOf(el?: Element | null): { x: number; y: number } {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export function useTaskActions() {
  const qc = useQueryClient();
  const L = useLabels();

  const refreshAfterChange = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.briefing });
    void qc.invalidateQueries({ queryKey: qk.projects });
  }, [qc]);

  const checkSector = useCallback(async () => {
    try {
      const hud = await qc.fetchQuery<Hud>({ queryKey: qk.game.hud, queryFn: api.game.hud, staleTime: 0 });
      if (hud.today.total > 0 && hud.today.pending === 0) {
        const t0 = startOfDay(Date.now());
        const done = (qc.getQueriesData<TaskView[]>({ queryKey: qk.tasksAll }).flatMap(([, d]) => d ?? []))
          .filter((t, i, a) => t.completedAt && t.completedAt >= t0 && a.findIndex((x) => x.id === t.id) === i);
        const onTime = done.filter((t) => !t.dueAt || (t.completedAt ?? 0) <= (t.dueAllDay ? startOfDay(t.dueAt) + 86_400_000 : t.dueAt)).length;
        const first = Math.min(...done.map((t) => t.completedAt ?? Date.now()), Date.now());
        maybeSectorCleared({ missions: hud.today.done, accuracy: done.length ? onTime / done.length : 1, durationMs: Date.now() - first });
      }
    } catch { /* non-critical */ }
  }, [qc]);

  const reopen = useCallback(async (task: TaskView) => {
    markLocal(task.id);
    patchTaskInCaches(qc, task.id, { status: task.status === 'done' ? 'todo' : task.status, completedAt: null, completedBy: null });
    try {
      const t = await api.tasks.reopen(task.id);
      upsertTaskInCaches(qc, t);
      sfx.undo();
      refreshAfterChange();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [qc, refreshAfterChange]);

  const complete = useCallback(async (task: TaskView, origin?: Element | null) => {
    const { x, y } = centerOf(origin);
    missionHit(x, y);
    markLocal(task.id);
    const before = { status: task.status, completedAt: task.completedAt, completedBy: task.completedBy };
    patchTaskInCaches(qc, task.id, { status: 'done', completedAt: Date.now(), isOverdue: false });
    try {
      const t = await api.tasks.complete(task.id);
      upsertTaskInCaches(qc, t);
      toast(<span><b>{L.missionComplete}</b> · <span className="muted">{task.title}</span></span>, {
        tone: 'success',
        action: { label: 'Undo', onClick: () => void reopen(t) },
      });
      refreshAfterChange();
      void checkSector();
    } catch (e) {
      patchTaskInCaches(qc, task.id, before);
      toast.error(errorMessage(e));
    }
  }, [qc, L, reopen, refreshAfterChange, checkSector]);

  const update = useCallback(async (task: TaskView, patch: UpdateTaskInput) => {
    markLocal(task.id);
    const optimistic: Partial<TaskView> = { ...(patch as Partial<TaskView>) };
    if (patch.waitingOn !== undefined) optimistic.waitingOn = patch.waitingOn ? { ...patch.waitingOn, since: task.waitingOn?.since ?? Date.now(), lastNudgedAt: task.waitingOn?.lastNudgedAt ?? null } : null;
    patchTaskInCaches(qc, task.id, optimistic);
    try {
      const t = await api.tasks.update(task.id, patch);
      upsertTaskInCaches(qc, t);
      if (patch.status || patch.dueAt !== undefined || patch.assigneeIds || patch.projectId !== undefined) {
        void qc.invalidateQueries({ queryKey: qk.tasksAll });
        refreshAfterChange();
      }
      return t;
    } catch (e) {
      upsertTaskInCaches(qc, task);
      toast.error(errorMessage(e));
      return null;
    }
  }, [qc, refreshAfterChange]);

  /** Undo a delete: replay the audit event, then put the task back wherever it is listed. */
  const restore = useCallback(async (task: TaskView, auditId: string) => {
    try {
      await api.audit.undo(auditId);
      const t = await api.tasks.get(task.id);
      markLocal(t.id);
      qc.setQueryData(qk.task(t.id), t);
      prependTaskToCaches(qc, t, (key) => {
        const q = key[1] as Record<string, unknown> | undefined;
        return !!q && (!q.projectId || q.projectId === t.projectId);
      });
      void qc.invalidateQueries({ queryKey: qk.tasksAll });
      void qc.invalidateQueries({ queryKey: qk.audit });
      refreshAfterChange();
      sfx.undo();
      toast.success(<span>Restored <b>“{t.title}”</b></span>);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [qc, refreshAfterChange]);

  const remove = useCallback(async (task: TaskView) => {
    markLocal(task.id);
    removeTaskFromCaches(qc, task.id);
    try {
      const { auditId } = await api.tasks.remove(task.id);
      toast(<span>Deleted <b>“{task.title}”</b></span>, { action: { label: 'Undo', onClick: () => void restore(task, auditId) }, duration: 8000 });
      refreshAfterChange();
    } catch (e) {
      void qc.invalidateQueries({ queryKey: qk.tasksAll });
      toast.error(errorMessage(e));
    }
  }, [qc, refreshAfterChange, restore]);

  const quickAdd = useCallback(async (text: string, defaults?: Partial<CreateTaskInput>) => {
    const t = await api.tasks.quick(text, defaults);
    markLocal(t.id);
    missionDeployed();
    prependTaskToCaches(qc, t, (key) => {
      const q = key[1] as Record<string, unknown> | undefined;
      if (!q) return false;
      if (q.projectId && q.projectId !== t.projectId) return false;
      return true;
    });
    qc.setQueryData(qk.task(t.id), t);
    void qc.invalidateQueries({ queryKey: qk.tasksAll });
    refreshAfterChange();
    void qc.invalidateQueries({ queryKey: qk.game.hud });
    return t;
  }, [qc, refreshAfterChange]);

  return { complete, reopen, update, remove, quickAdd };
}
