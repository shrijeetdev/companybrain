import type { Loop, LoopSide, Channel } from '@companybrain/types';
import { type Context, newId, now, record } from './context';
import { gateAction } from './autonomy';

/** how long before we auto-chase a loop that's in "their court" (local demo: 1 min) */
const CHASE_DELAY_MS = 60_000;

export interface CaptureLoopInput {
  orgId: string;
  actorId: string;
  title: string;
  why: string;
  side: LoopSide;
  channel: Channel;
  sourceRef?: string;
  replyTo?: string;
  ownerId?: string;
  dueAt?: number | null;
}

export function makeLoops(ctx: Context) {
  return {
    list(orgId: string, side?: LoopSide): Promise<Loop[]> {
      return ctx.db.loops.list(orgId, side);
    },

    get(id: string): Promise<Loop | null> {
      return ctx.db.loops.get(id);
    },

    /** Turn anything that needs a human into a tracked loop, and schedule the chase. */
    async capture(input: CaptureLoopInput): Promise<Loop> {
      const loop: Loop = {
        id: newId('loop'),
        orgId: input.orgId,
        title: input.title,
        why: input.why,
        side: input.side,
        status: 'open',
        channel: input.channel,
        sourceRef: input.sourceRef,
        replyTo: input.replyTo,
        ownerId: input.ownerId,
        dueAt: input.dueAt ?? null,
        createdBy: input.actorId,
        assignedTo: input.ownerId ? [input.ownerId] : [input.actorId],
        createdAt: now(),
        updatedAt: now(),
      };
      await ctx.db.loops.insert(loop);
      await record(ctx, {
        orgId: loop.orgId,
        type: 'loop.captured',
        entityId: loop.id,
        actorId: input.actorId,
        channel: loop.channel,
        undo: { delete: loop.id },
      });

      // If the ball is in THEIR court, we owe nothing now — but we must not let it slip.
      // The chase is gated by the org's autonomy: auto schedules it, ask queues an
      // approval, off does nothing.
      if (loop.side === 'theirs') {
        await gateAction(ctx, 'chase', { orgId: loop.orgId, loopId: loop.id, title: `Chase: ${loop.title}`, delayMs: CHASE_DELAY_MS });
      }
      return loop;
    },

    async close(id: string, actorId: string): Promise<Loop> {
      const prev = await ctx.db.loops.get(id);
      if (!prev) throw new Error(`loop ${id} not found`);
      const loop = await ctx.db.loops.update(id, { status: 'closed' });
      await record(ctx, {
        orgId: loop.orgId,
        type: 'loop.closed',
        entityId: loop.id,
        actorId,
        undo: { restoreStatus: prev.status },
      });
      return loop;
    },

    async snooze(id: string, actorId: string, untilAt: number): Promise<Loop> {
      const loop = await ctx.db.loops.update(id, { status: 'snoozed', dueAt: untilAt });
      await record(ctx, { orgId: loop.orgId, type: 'loop.snoozed', entityId: loop.id, actorId });
      await ctx.queue.enqueue('sendReminder', { loopId: loop.id, orgId: loop.orgId }, { delayMs: Math.max(0, untilAt - now()) });
      return loop;
    },
  };
}

export type LoopService = ReturnType<typeof makeLoops>;
