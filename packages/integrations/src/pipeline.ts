// The ONE pipeline every channel funnels into. Build it once for WhatsApp; Gmail, Slack,
// Telegram and GitHub all normalize to InboundMessage and reuse everything below.
//
//   OAuth/token → webhook in → normalize → [needs a human?] → capture loop → enqueue → AI → log

import type { Channel } from '@companybrain/types';
import type { Core } from '@companybrain/core';

export interface InboundMessage {
  orgId: string;
  channel: Channel;
  /** sender handle (phone, email, slack id…) */
  from: string;
  text: string;
  /** thread/message id we can link back to */
  ref?: string;
  /** the human this should land on; defaults to the org's local user */
  ownerId?: string;
}

/**
 * Decide whether an inbound message needs a human. The naive rule here (anything that
 * isn't an auto-ack needs a human) is where the real classifier/LLM plugs in later.
 */
export function needsHuman(msg: InboundMessage): boolean {
  const t = msg.text.trim().toLowerCase();
  if (!t) return false;
  if (['ok', '👍', 'thanks', 'thank you', 'noted'].includes(t)) return false;
  return true;
}

/** Run a normalized message through the pipeline. Returns the captured loop id, if any. */
export async function ingest(core: Core, msg: InboundMessage): Promise<string | null> {
  if (!needsHuman(msg)) return null;
  const loop = await core.loops.capture({
    orgId: msg.orgId,
    actorId: 'agent_scout',
    title: summarize(msg.text),
    why: `${msg.channel} from ${msg.from}`,
    side: 'yours',
    channel: msg.channel,
    sourceRef: msg.ref,
    // remember who to reply to on this channel (the sender's phone for WhatsApp)
    replyTo: msg.from,
    ownerId: msg.ownerId,
  });
  // Auto-acknowledge — gated by the org's autonomy: auto enqueues the reply (worker sends
  // it, respecting retries/backoff), ask queues it for approval, off stays silent.
  await core.autonomy.gate('draftReplies', { orgId: msg.orgId, loopId: loop.id, title: `Auto-reply: ${loop.title}` });
  return loop.id;
}

/** 2–3 word loop title from a message. Stub for the AI-summarize step. */
function summarize(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
}
