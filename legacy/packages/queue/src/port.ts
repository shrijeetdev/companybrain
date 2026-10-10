// The Queue port. "Never let it slip" lives here: chasing loops, sending briefings,
// nightly sweeps. One embedded adapter: in-process (real timers, same process as the API).
//
// CRITICAL: the in-process adapter is a REAL implementation, not a stub. If scheduled
// work silently didn't fire, "never let it slip" would be a lie.

import type { JobName } from '@companybrain/types';

export type JobHandler<T = Record<string, unknown>> = (data: T) => Promise<void>;

export interface EnqueueOptions {
  /** delay before the job runs, in ms */
  delayMs?: number;
}

export interface Queue {
  init(): Promise<void>;
  /** register a handler for a job name (call before start) */
  on<T = Record<string, unknown>>(name: JobName, handler: JobHandler<T>): void;
  /** push a one-off job */
  enqueue<T = Record<string, unknown>>(name: JobName, data: T, opts?: EnqueueOptions): Promise<void>;
  /** push a repeating job (e.g. briefings every morning) */
  schedule<T = Record<string, unknown>>(name: JobName, data: T, everyMs: number): Promise<void>;
  /** begin processing registered handlers */
  start(): Promise<void>;
  close(): Promise<void>;
}
