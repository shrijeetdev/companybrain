// Reversibility — the third pillar of "scoped, logged, reversible". Every mutating action
// records an audit event with an `undo` payload; this applies that payload to put the world
// back, then logs the reversal (which is itself not reversible, so you can't loop forever).

import { type Context, record } from './context';

export interface UndoResult {
  undone: string;
  /** the event type that was reversed */
  type: string;
}

interface UndoPayload {
  /** delete an entity by id (reverses a *.created event) */
  delete?: string;
  restoreStatus?: string;
  restoreDay?: string;
  restoreStage?: string;
}

/** Reverse a single audit event by id. Throws if it's missing or not reversible. */
export async function undoEvent(ctx: Context, eventId: string): Promise<UndoResult> {
  const ev = await ctx.db.events.get(eventId);
  if (!ev) throw notReversible(`event ${eventId} not found`);
  if (!ev.reversible || !ev.undo) throw notReversible(`event ${eventId} is not reversible`);

  const u = ev.undo as UndoPayload;

  if (u.delete) {
    const id = u.delete;
    if (id.startsWith('loop_')) await ctx.db.loops.remove(id);
    else if (id.startsWith('task_')) await ctx.db.tasks.remove(id);
    else if (id.startsWith('lead_')) await ctx.db.leads.remove(id);
    else throw notReversible(`don't know how to delete ${id}`);
  } else if (u.restoreStatus) {
    await ctx.db.loops.update(ev.entityId, { status: u.restoreStatus as never });
  } else if (u.restoreDay) {
    await ctx.db.tasks.update(ev.entityId, { day: u.restoreDay as never });
  } else if (u.restoreStage) {
    await ctx.db.leads.update(ev.entityId, { stage: u.restoreStage as never });
  } else {
    throw notReversible(`event ${eventId} has no known undo action`);
  }

  // Log the reversal — not itself reversible (no undoing an undo).
  await record(ctx, { orgId: ev.orgId, type: 'event.undone', entityId: eventId, actorId: 'user_local', reversible: false });
  return { undone: eventId, type: ev.type };
}

function notReversible(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}
