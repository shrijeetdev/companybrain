// Background job handlers — "never let it slip". Registered against the queue port and
// run in-process alongside the API (one app, one process). Outbound sending goes through
// the injected Messenger port, so these handlers can reply over WhatsApp/email/etc.
// without core importing any integration.

import { type Context, record } from './context';

export interface LoopJob extends Record<string, unknown> {
  loopId: string;
  orgId: string;
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
}
