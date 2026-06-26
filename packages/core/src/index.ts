// core — the deployment-agnostic heart. Wires the three ports into domain services and
// the background workers. Knows nothing about SQLite/Postgres/Redis/Stripe/HTTP.

import { createDatabase, type Database, type DbOptions } from '@companybrain/db';
import { createQueue, type Queue } from '@companybrain/queue';
import { createAuth, type Auth } from '@companybrain/auth';

import { type Context, type Messenger, type Drafter, consoleMessenger, templateDrafter } from './context';
import { makeLoops } from './loops';
import { makeTasks } from './tasks';
import { makeLeads } from './leads';
import { makeAgents } from './agents';
import { makeAutonomy, makeApprovals } from './autonomy';
import { undoEvent, type UndoResult } from './undo';
import { registerWorkers } from './workers';

export * from './context';
export * from './agents';
export * from './autonomy';
export * from './undo';
export { registerWorkers } from './workers';
export { seedIfEmpty } from './seed';
export type { CaptureLoopInput } from './loops';
export type { CreateTaskInput } from './tasks';
export type { CreateLeadInput } from './leads';

export interface Core {
  ctx: Context;
  loops: ReturnType<typeof makeLoops>;
  tasks: ReturnType<typeof makeTasks>;
  leads: ReturnType<typeof makeLeads>;
  agents: ReturnType<typeof makeAgents>;
  autonomy: ReturnType<typeof makeAutonomy>;
  approvals: ReturnType<typeof makeApprovals>;
  events: { list: Context['db']['events']['list']; undo: (eventId: string) => Promise<UndoResult> };
  /** Optional server-side LLM injection point (wired in M5); when undefined, leads fall back to heuristics. */
  llm?: { extractLead?: (note: string) => Promise<Partial<import('@companybrain/types').Lead>> };
}

/** Build core from already-constructed ports (used when you want to inject test doubles). */
export function createCoreFromPorts(ports: { db: Database; queue: Queue; auth: Auth; messenger?: Messenger; drafter?: Drafter }): Core {
  const ctx: Context = {
    db: ports.db,
    queue: ports.queue,
    auth: ports.auth,
    messenger: ports.messenger ?? consoleMessenger,
    drafter: ports.drafter ?? templateDrafter,
  };
  return {
    ctx,
    loops: makeLoops(ctx),
    tasks: makeTasks(ctx),
    leads: makeLeads(ctx),
    agents: makeAgents(),
    autonomy: makeAutonomy(ctx),
    approvals: makeApprovals(ctx),
    events: {
      list: (orgId: string, limit?: number) => ctx.db.events.list(orgId, limit),
      undo: (eventId: string) => undoEvent(ctx, eventId),
    },
  };
}

export interface BootstrapOptions {
  db?: DbOptions;
  /** outbound sender injected by the app (e.g. WhatsApp). Defaults to a logging no-op. */
  messenger?: Messenger;
  /** reply drafter injected by the app (LLM-backed). Defaults to a fixed template. */
  drafter?: Drafter;
}

export interface Bootstrap {
  core: Core;
  db: Database;
  queue: Queue;
  auth: Auth;
  /** start background processing (call in the process that owns the worker) */
  startWorkers(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * The one call the app makes. Initializes the embedded SQLite + in-process queue + local
 * auth, builds core, and registers the background workers (the caller starts them, since
 * everything runs in one process).
 */
export async function bootstrap(opts: BootstrapOptions = {}): Promise<Bootstrap> {
  const db = createDatabase(opts.db);
  const queue = createQueue();
  const auth = createAuth();

  await db.init();
  await queue.init();
  await auth.init();

  const core = createCoreFromPorts({ db, queue, auth, messenger: opts.messenger, drafter: opts.drafter });
  registerWorkers(core.ctx);

  return {
    core,
    db,
    queue,
    auth,
    async startWorkers() {
      await queue.start();
    },
    async shutdown() {
      await queue.close();
      await db.close();
    },
  };
}
