// Persistent scheduler over the `jobs` table: atomic claim, handler dispatch, retries with
// exponential backoff (max 5 attempts), dedupe by key. Survives restarts (state lives in SQLite).

import type { Job, JobKind } from '@companybrain/types';
import type { Ctx } from './context.js';

export type JobHandler = (job: Job) => Promise<void>;

export const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000;
const MAX_ROUNDS = 20;

export interface Scheduler {
  start(intervalMs?: number): void;
  stop(): Promise<void>;
  /** Run all due jobs (including ones made due by handlers in this tick). Returns how many ran. */
  tick(): Promise<number>;
}

export function createScheduler(ctx: Ctx, handlers: Record<JobKind, JobHandler>): Scheduler {
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<number> | null = null;

  // A crash mid-job leaves rows in 'running': put them back.
  const recovered = ctx.db.jobs.recoverRunning(ctx.clock());
  if (recovered) ctx.log.info(`[scheduler] recovered ${recovered} interrupted job(s)`);

  async function runOne(job: Job): Promise<void> {
    const handler = handlers[job.kind];
    try {
      if (!handler) throw new Error(`no handler for job kind ${job.kind}`);
      await handler(job);
      ctx.db.jobs.complete(job.orgId, job.id, ctx.clock());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const now = ctx.clock();
      const retryAt = job.attempts < MAX_ATTEMPTS ? now + BACKOFF_BASE_MS * 2 ** (job.attempts - 1) : null;
      const status = ctx.db.jobs.fail(job.orgId, job.id, msg.slice(0, 1000), retryAt, now);
      ctx.log.warn(`[scheduler] job ${job.kind} (${job.key}) failed (attempt ${job.attempts}/${MAX_ATTEMPTS}) → ${status}: ${msg}`);
    }
  }

  async function doTick(): Promise<number> {
    let total = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const jobs = ctx.db.jobs.claimDue(ctx.clock(), 100);
      if (!jobs.length) break;
      for (const job of jobs) await runOne(job);
      total += jobs.length;
    }
    return total;
  }

  const scheduler: Scheduler = {
    tick() {
      // Never run two ticks concurrently (setInterval + a manual tick).
      if (running) return running.then(() => scheduler.tick());
      running = doTick().finally(() => {
        running = null;
      });
      return running;
    },
    start(intervalMs = 10_000) {
      if (timer) return;
      const fire = () => {
        scheduler.tick().catch((err) => ctx.log.error('[scheduler] tick failed', err));
      };
      timer = setInterval(fire, Math.max(250, intervalMs));
      timer.unref?.();
      fire();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (running) await running.catch(() => 0);
    },
  };
  return scheduler;
}
