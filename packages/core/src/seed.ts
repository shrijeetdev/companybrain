// Seed a little demo data so the npx/local app isn't an empty shell on first run.

import type { Core } from './index';
import { LOCAL_ORG_ID, LOCAL_USER_ID } from '@companybrain/auth';

export async function seedIfEmpty(core: Core): Promise<void> {
  const existing = await core.loops.list(LOCAL_ORG_ID);
  if (existing.length > 0) return;

  const org = LOCAL_ORG_ID;
  const me = LOCAL_USER_ID;

  await core.loops.capture({ orgId: org, actorId: me, title: 'Reply to Priya re: contract', why: 'She asked 2 days ago', side: 'yours', channel: 'email' });
  await core.loops.capture({ orgId: org, actorId: me, title: 'Waiting on design files from Sam', why: 'Promised Monday', side: 'theirs', channel: 'slack' });
  await core.loops.capture({ orgId: org, actorId: me, title: 'Confirm Thursday demo time', why: 'WhatsApp from lead', side: 'yours', channel: 'whatsapp' });

  await core.tasks.create({ orgId: org, actorId: me, emoji: '📝', title: 'Draft Q3 plan', day: 'today', priority: 'high' });
  await core.tasks.create({ orgId: org, actorId: me, emoji: '📞', title: 'Call supplier', day: 'tomorrow', priority: 'med' });

  await core.leads.create({ orgId: org, actorId: me, name: 'Aisha Khan', company: 'Northwind', title: 'Head of Ops', phone: '+971500000000', what: 'Interested in team plan' });
}
