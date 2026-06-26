// End-to-end check of the WhatsApp pipeline + the AI reply-drafter injection:
//   parse inbound → ingest (capture loop) → replyLoop job → drafter → messenger.send
// Uses a capturing messenger + a fake drafter so it asserts without network/LLM calls.
//   run:  pnpm --filter @companybrain/server exec tsx scripts/verify-whatsapp.mts

import { bootstrap, type Messenger, type OutboundMessage, type Drafter } from '@companybrain/core';
import { ingest, whatsapp, type InboundMessage } from '@companybrain/integrations';
import { LOCAL_ORG_ID } from '@companybrain/auth';

const fail = (m: string) => { console.error('✗', m); process.exitCode = 1; };
const ok = (m: string) => console.log('✓', m);
const tick = () => new Promise((r) => setTimeout(r, 50));

const body = {
  entry: [{ changes: [{ value: { messages: [
    { from: '15551234567', id: 'wamid.ABC', type: 'text', text: { body: 'Hi! Can we meet Thursday at 3pm?' } },
  ] } }] }],
};
const inbound: InboundMessage[] = whatsapp.parseInbound(LOCAL_ORG_ID, body);
inbound.length === 1 && inbound[0]!.from === '15551234567'
  ? ok('parsed inbound WhatsApp message')
  : fail(`parseInbound wrong: ${JSON.stringify(inbound)}`);

// 1) Default drafter (no LLM configured) → templated reply, sent to the sender.
{
  const sent: OutboundMessage[] = [];
  const messenger: Messenger = { async send(m) { sent.push(m); } };
  const boot = await bootstrap({ messenger });
  await boot.startWorkers();

  const loopId = await ingest(boot.core, inbound[0]!);
  const loop = loopId ? await boot.core.loops.get(loopId) : null;
  loop && loop.channel === 'whatsapp' && loop.replyTo === '15551234567'
    ? ok(`captured loop "${loop.title}" (replyTo=${loop.replyTo})`)
    : fail(`ingest did not capture a proper loop: ${JSON.stringify(loop)}`);

  await tick();
  const reply = sent.find((s) => s.to === '15551234567');
  reply && /logged/i.test(reply.text)
    ? ok(`templated auto-reply sent → "${reply.text}"`)
    : fail(`no templated reply: ${JSON.stringify(sent)}`);

  const types = new Set((await boot.core.events.list(LOCAL_ORG_ID, 50)).map((e) => e.type));
  types.has('loop.captured') && types.has('reply.sent')
    ? ok(`audit trail recorded: ${[...types].join(', ')}`)
    : fail(`audit missing events: ${[...types].join(', ')}`);
  await boot.shutdown();
}

// 2) Injected drafter (stands in for the LLM) → its text is what gets sent.
{
  const sent: OutboundMessage[] = [];
  const messenger: Messenger = { async send(m) { sent.push(m); } };
  const drafter: Drafter = { async draftReply({ title }) { return `AI-DRAFTED reply about: ${title}`; } };
  const boot = await bootstrap({ messenger, drafter });
  await boot.startWorkers();

  await ingest(boot.core, inbound[0]!);
  await tick();
  const reply = sent.find((s) => s.to === '15551234567');
  reply && reply.text.startsWith('AI-DRAFTED')
    ? ok(`injected drafter used for the reply → "${reply.text}"`)
    : fail(`drafter injection not used: ${JSON.stringify(sent)}`);
  await boot.shutdown();
}

console.log(process.exitCode ? '\nFAILED' : '\nAll WhatsApp + drafter checks passed.');
