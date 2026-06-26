// In-process queue — the one queue adapter. Real timers, real delays, real repeats.
// No Redis, no extra process. Jobs run inside the same Node process as the API.

import type { JobName } from '@companybrain/types';
import type { Queue, JobHandler, EnqueueOptions } from './port';

export class InProcessQueue implements Queue {
  private handlers = new Map<JobName, JobHandler>();
  private timers = new Set<NodeJS.Timeout>();
  private started = false;

  async init() {}

  on<T = Record<string, unknown>>(name: JobName, handler: JobHandler<T>) {
    this.handlers.set(name, handler as JobHandler);
  }

  private async run(name: JobName, data: Record<string, unknown>) {
    const handler = this.handlers.get(name);
    if (!handler) {
      console.warn(`[queue] no handler registered for "${name}" — dropping job`);
      return;
    }
    try {
      await handler(data);
    } catch (err) {
      console.error(`[queue] job "${name}" failed:`, err);
    }
  }

  async enqueue<T = Record<string, unknown>>(name: JobName, data: T, opts: EnqueueOptions = {}) {
    const fire = () => void this.run(name, data as Record<string, unknown>);
    if (opts.delayMs && opts.delayMs > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        fire();
      }, opts.delayMs);
      this.timers.add(t);
    } else {
      // next tick so enqueue never blocks the caller
      queueMicrotask(fire);
    }
  }

  async schedule<T = Record<string, unknown>>(name: JobName, data: T, everyMs: number) {
    const t = setInterval(() => void this.run(name, data as Record<string, unknown>), everyMs);
    this.timers.add(t);
  }

  async start() {
    this.started = true;
  }

  async close() {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers.clear();
    this.started = false;
  }
}
