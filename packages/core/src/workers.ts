// Background job handlers — "never let it slip". Registered against the queue port and
// run in-process alongside the API (one app, one process). Outbound sending goes through
// the injected Messenger port, so these handlers can reply over WhatsApp/email/etc.
// without core importing any integration.

import { type Context, record } from './context';
import type { WordpressCreds } from './ai-actions';

export interface LoopJob extends Record<string, unknown> {
  loopId: string;
  orgId: string;
}

export interface AiTaskJob extends Record<string, unknown> {
  taskId: string;
  /** set when this firing is the human-approved continuation of an `ask` run */
  approveRunId?: string;
}

export function registerWorkers(ctx: Context): void {
  // Auto-acknowledge an inbound message we just turned into a loop (autonomy: draftReplies).
  ctx.queue.on<LoopJob>('replyLoop', async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === 'closed') return;
    if (!loop.replyTo) {
      console.warn(`[worker] replyLoop ${loopId}: no replyTo address — skipping send`);
      return;
    }
    // AI-written when an LLM is configured; a fixed template otherwise.
    const text = await ctx.drafter.draftReply({ title: loop.title, why: loop.why, channel: loop.channel });
    await ctx.messenger.send({ channel: loop.channel, to: loop.replyTo, text });
    await record(ctx, { orgId, type: 'reply.sent', entityId: loopId, actorId: 'agent_scout', channel: loop.channel });
    console.log(`[worker] replied to ${loop.replyTo} for loop ${loopId}`);
  });

  // Nudge the other party when the ball has been in THEIR court too long.
  ctx.queue.on<LoopJob>('chaseLoop', async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === 'closed') return; // already handled — don't nag
    if (loop.replyTo) {
      await ctx.messenger.send({ channel: loop.channel, to: loop.replyTo, text: `Just following up on: ${loop.title} 🙂` });
    }
    await record(ctx, { orgId, type: 'reminder.sent', entityId: loopId, actorId: 'agent_scout', channel: loop.channel });
    console.log(`[worker] chased loop ${loopId}: "${loop.title}"`);
  });

  ctx.queue.on<LoopJob>('sendReminder', async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === 'closed') return;
    await record(ctx, { orgId, type: 'reminder.sent', entityId: loopId, actorId: 'agent_scout' });
    console.log(`[worker] reminder fired for loop ${loopId}`);
  });

  ctx.queue.on<{ orgId: string }>('sendBriefing', async ({ orgId }) => {
    const open = await ctx.db.loops.list(orgId);
    const yours = open.filter((l) => l.side === 'yours' && l.status !== 'closed').length;
    console.log(`[worker] briefing for ${orgId}: ${yours} loop(s) in your court`);
    await record(ctx, { orgId, type: 'briefing.delivered', entityId: orgId, actorId: 'agent_scout' });
  });

  ctx.queue.on<{ orgId: string }>('autoSweep', async ({ orgId }) => {
    const open = await ctx.db.loops.list(orgId);
    console.log(`[worker] nightly sweep for ${orgId}: ${open.length} loop(s) reviewed`);
  });

  // Nightly SQLite backup. The one database is one file, so "back up the company" is one
  // consistent copy of it; retention prunes the rest. A failure here is logged, never fatal —
  // a missed backup must not take the app down.
  ctx.queue.on<Record<string, never>>('backupDatabase', async () => {
    const sourcePath = ctx.db.filePath?.();
    if (!sourcePath) return; // not a file-backed database (e.g. Supabase) — nothing to copy
    try {
      const { backupDatabase } = await import('@companybrain/db');
      const r = await backupDatabase({ sourcePath });
      console.log(`[worker] backup → ${r.path} (${Math.round(r.bytes / 1024)}KB in ${r.durationMs}ms${r.pruned.length ? `, pruned ${r.pruned.length}` : ''})`);
    } catch (err) {
      console.error('[worker] backup failed:', err instanceof Error ? err.message : err);
    }
  });

  // AI task executor — runs an AI-doable task through the LLM + the action adapter.
  // The ExecutorDeps are assembled here: the clients come from ctx.aiClients (injected by
  // the app, like Messenger/Drafter), the API key from env, the WordPress credentials from
  // the connections table. core still imports no concrete client.
  ctx.queue.on<AiTaskJob>('runAiTask', async ({ taskId, approveRunId }) => {
    const executor = ctx.executor;
    if (!executor) { console.warn(`[worker] runAiTask ${taskId}: executor not wired`); return; }

    const clients = ctx.aiClients;
    if (!clients) { console.warn(`[worker] runAiTask ${taskId}: AI clients not injected — skipping`); return; }

    const apiKey = process.env.OPENROUTER_API_KEY ?? '';
    if (!apiKey) {
      console.warn(`[worker] runAiTask ${taskId}: OPENROUTER_API_KEY not set — skipping`);
      return;
    }

    // Resolve WordPress creds (if any) for publish_blog actions. Never logged.
    const task = await ctx.db.tasks.get(taskId);
    let wordpressCreds: WordpressCreds | undefined;
    try {
      const conn = await ctx.db.connections.get(task?.orgId ?? '', 'wordpress');
      const creds = conn?.credentials as Partial<WordpressCreds> | undefined;
      if (creds?.apiUrl && creds.username && creds.appPassword) {
        wordpressCreds = { apiUrl: creds.apiUrl, username: creds.username, appPassword: creds.appPassword };
      }
    } catch { /* connections repo may be unavailable */ }

    const deps = { complete: clients.complete, actionDeps: { wordpressCreds, publishBlog: clients.publishBlog }, openRouterApiKey: apiKey };
    if (approveRunId) await executor.approve(approveRunId, deps);
    else await executor.run(taskId, deps);
  });
}
