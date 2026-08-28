// The AI task runner. One run = gate → (model → prompt → LLM) → maybe action → record.
// ask: LLM runs (so a human can review the draft) but the action waits for approve().
// auto: LLM + action both run. off: nothing. The effective level is the stricter of the
// global executeAi gate and the action's defaultAutonomy floor — a per-action floor can
// never be loosened by flipping the global to auto.

import type { Context } from './context';
import type { Autonomy, AiRun, Task } from '@companybrain/types';
import { resolveAutonomy } from './autonomy';
import { resolveModel } from './ai-router';
import { ACTIONS, type ActionDeps } from './ai-actions';
import { newId, now, record } from './context';

export interface ExecutorDeps {
  /** The OpenRouter client, injected so tests can stub it and core stays adapter-free. */
  complete: (opts: any) => Promise<any>;
  actionDeps: ActionDeps;
  openRouterApiKey: string;
}

const RANK: Record<Autonomy, number> = { off: 0, ask: 1, auto: 2 };
function stricter(a: Autonomy, b: Autonomy): Autonomy {
  return RANK[a] <= RANK[b] ? a : b;
}

export function makeExecutor(ctx: Context) {
  async function run(taskId: string, deps: ExecutorDeps): Promise<void> {
    const task = await ctx.db.tasks.get(taskId);
    if (!task || !task.aiAction) return;
    if (task.aiStatus && task.aiStatus !== 'queued') return; // idempotent: skip non-queued

    const action = ACTIONS[task.aiAction];
    if (!action) return;
    const globalLevel = (await resolveAutonomy(ctx.db, task.orgId)).executeAi;
    const level = stricter(globalLevel, action.defaultAutonomy);

    if (level === 'off') return; // disabled; leave queued

    const model = resolveModel(task.aiAction, task.aiConfig?.modelOverride);
    const { system, user } = action.prompt(task);

    const aiRun: AiRun = {
      id: newId('airun'), orgId: task.orgId, taskId: task.id, action: task.aiAction,
      model, status: 'running', systemPrompt: system, userPrompt: user, at: now(),
    };
    await ctx.db.aiRuns.insert(aiRun);
    await ctx.db.tasks.update(task.id, { aiStatus: 'running', aiRunId: aiRun.id });

    const result = await deps.complete({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      apiKey: deps.openRouterApiKey,
    });

    if (!result?.ok) {
      await ctx.db.aiRuns.update(aiRun.id, { status: 'failed', error: result?.error ?? 'unknown LLM failure', durationMs: result?.durationMs });
      await ctx.db.tasks.update(task.id, { aiStatus: 'failed' });
      await record(ctx, { orgId: task.orgId, type: 'ai.task.failed', entityId: task.id, actorId: 'agent_executor' });
      return;
    }

    await ctx.db.aiRuns.update(aiRun.id, {
      status: level === 'auto' ? 'running' : 'awaiting_review',
      output: result.text,
      durationMs: result.durationMs,
    });

    if (level === 'auto') {
      // Re-read the task so the action sees aiRunId/aiStatus written above.
      const fresh = (await ctx.db.tasks.get(task.id)) ?? task;
      await runAction(fresh, result.text, aiRun.id, deps);
    } else {
      // ask: park with the draft available for review.
      await ctx.db.tasks.update(task.id, { aiStatus: 'awaiting_review' });
    }
  }

  /** The outward-facing half: hand the output to the action, then record the outcome. */
  async function runAction(task: Task, output: string, runId: string, deps: ExecutorDeps): Promise<void> {
    const action = ACTIONS[task.aiAction!];
    const res = await action.run({ task, output, ctx, deps: deps.actionDeps });
    if (!res.ok) {
      await ctx.db.aiRuns.update(runId, { status: 'failed', error: res.error });
      await ctx.db.tasks.update(task.id, { aiStatus: 'failed' });
      await record(ctx, { orgId: task.orgId, type: 'ai.task.failed', entityId: task.id, actorId: 'agent_executor' });
      return;
    }
    await ctx.db.aiRuns.update(runId, { status: 'done', resultRef: res.resultRef });
    await ctx.db.tasks.update(task.id, { aiStatus: 'done', completed: true, completedAt: now() });
    await record(ctx, {
      orgId: task.orgId, type: 'ai.task.executed', entityId: task.id, actorId: 'agent_executor',
      undo: { restoreCompleted: task.completed ?? false, restoreCompletedAt: task.completedAt ?? null },
    });
  }

  /** The ask-path continuation: a human approved the draft, so the action may now run. */
  async function approve(runId: string, deps: ExecutorDeps): Promise<void> {
    const aiRun = await ctx.db.aiRuns.get(runId);
    if (!aiRun || aiRun.status !== 'awaiting_review') return;
    const task = await ctx.db.tasks.get(aiRun.taskId);
    if (!task || !task.aiAction) return;
    await runAction(task, aiRun.output ?? '', aiRun.id, deps);
  }

  return { run, approve };
}

export type ExecutorService = ReturnType<typeof makeExecutor>;
