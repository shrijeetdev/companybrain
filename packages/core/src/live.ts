// In-process live-event bus. The server subscribes per connected client; events are org-scoped
// and optionally targeted to specific members.

import type { LiveBus, LiveEvent } from '@companybrain/types';

interface Sub { memberId: string; fn: (e: LiveEvent) => void }

export function createLiveBus(log?: { warn(...a: unknown[]): void }): LiveBus {
  const subs = new Map<string, Set<Sub>>();
  return {
    publish(orgId, event, opts) {
      const set = subs.get(orgId);
      if (!set) return;
      const only = opts?.memberIds ? new Set(opts.memberIds) : null;
      for (const s of [...set]) {
        if (only && !only.has(s.memberId)) continue;
        try {
          s.fn(event);
        } catch (err) {
          log?.warn('[live] subscriber threw', err);
        }
      }
    },
    subscribe(orgId, memberId, fn) {
      const sub: Sub = { memberId, fn };
      if (!subs.has(orgId)) subs.set(orgId, new Set());
      subs.get(orgId)!.add(sub);
      return () => {
        const set = subs.get(orgId);
        set?.delete(sub);
        if (set && !set.size) subs.delete(orgId);
      };
    },
  };
}
