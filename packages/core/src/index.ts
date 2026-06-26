// core — the deployment-agnostic heart. Wires the three ports into domain services and
// the background workers. Knows nothing about SQLite/Postgres/Redis/Stripe/HTTP.

import { createDatabase, type Database, type DbOptions } from '@companybrain/db';
import { createQueue, type Queue } from '@companybrain/queue';
import { createAuth, type Auth } from '@companybrain/auth';

import { type Context, type Messenger, consoleMessenger } from './context';
import { makeLoops } from './loops';
import { makeTasks } from './tasks';
import { makeLeads } from './leads';
import { makeAgents } from './agents';
import { registerWorkers } from './workers';

export * from './context';
export * from './agents';
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
  events: { list: Context['db']['events']['list'] };
  /** Optional server-side LLM injection point (wired in M5); when undefined, leads fall back to heuristics. */
  llm?: { extractLead?: (note: string) => Promise<Partial<import('@companybrain/types').Lead>> };
}

/** Build core from already-constructed ports (used when you want to inject test doubles). */
export function createCoreFromPorts(ports: { db: Database; queue: Queue; auth: Auth; messenger?: Messenger }): Core {
  const ctx: Context = { ...ports, messenger: ports.messenger ?? consoleMessenger };
  return {
    ctx,
    loops: makeLoops(ctx),
    tasks: makeTasks(ctx),
    leads: makeLeads(ctx),
    agents: makeAgents(),
    events: { list: (orgId: string, limit?: number) => ctx.db.events.list(orgId, limit) },
  };
}

export interface BootstrapOptions {
  db?: DbOptions;
  /** outbound sender injected by the app (e.g. WhatsApp). Defaults to a logging no-op. */
  messenger?: Messenger;
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

  const core = createCoreFromPorts({ db, queue, auth, messenger: opts.messenger });
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
