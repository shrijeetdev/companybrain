import type { Queue } from './port';
import { InProcessQueue } from './in-process';

export type { Queue, JobHandler, EnqueueOptions } from './port';
export { InProcessQueue } from './in-process';

/** One in-process queue with real timers — no Redis, no extra process. */
export function createQueue(): Queue {
  return new InProcessQueue();
}
