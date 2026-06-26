// The dependency bundle every service receives. core knows the PORTS, never the adapters.

import { randomUUID } from 'node:crypto';
import type { Database } from '@companybrain/db';
import type { Queue } from '@companybrain/queue';
import type { Auth } from '@companybrain/auth';
import type { DomainEvent, EventType, Channel } from '@companybrain/types';

/**
 * Outbound messaging port. core's workers reply/chase through this WITHOUT importing any
 * integration (which would be circular — integrations import core). The app injects a
 * channel-aware messenger (e.g. WhatsApp-backed) at bootstrap; the default just logs.
 */
export interface OutboundMessage {
  channel: Channel;
  to: string;
  text: string;
}
export interface Messenger {
  send(msg: OutboundMessage): Promise<void>;
}

export const consoleMessenger: Messenger = {
  async send({ channel, to, text }) {
    console.log(`[messenger:noop] would send via ${channel} → ${to}: ${text}`);
  },
};

/**
 * Reply-drafting port. The app injects an LLM-backed drafter (server-side); core never
 * imports the LLM (which would be circular). The default writes a fixed template so the
 * pipeline works with zero AI configured.
 */
export interface Drafter {
  draftReply(input: { title: string; why: string; channel: Channel }): Promise<string>;
}

export const templateDrafter: Drafter = {
  async draftReply({ title }) {
    return `Thanks — we’ve logged “${title}” and someone will get back to you shortly. 🤝`;
  },
};

export interface Context {
  db: Database;
  queue: Queue;
  auth: Auth;
  messenger: Messenger;
  drafter: Drafter;
}

export const newId = (prefix: string): string => `${prefix}_${randomUUID().slice(0, 8)}`;
export const now = (): number => Date.now();

/** Append an immutable audit event. Everything that mutates state goes through here. */
export async function record(
  ctx: Context,
  input: {
    orgId: string;
    type: EventType;
    entityId: string;
    actorId: string;
    reversible?: boolean;
    undo?: Record<string, unknown> | null;
    channel?: Channel;
  },
): Promise<DomainEvent> {
  const event: DomainEvent = {
    id: newId('evt'),
    orgId: input.orgId,
    type: input.type,
    entityId: input.entityId,
    actorId: input.actorId,
    reversible: input.reversible ?? true,
    undo: input.undo ?? null,
    channel: input.channel,
    at: now(),
  };
  return ctx.db.events.append(event);
}
