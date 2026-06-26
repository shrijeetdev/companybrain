import type { Lead, LeadStage, Channel } from '@companybrain/types';
import { type Context, newId, now, record } from './context';

const STAGE_ORDER: LeadStage[] = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];

export interface CreateLeadInput {
  orgId: string;
  actorId: string;
  name: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  source?: Channel;
  what?: string;
  assignedTo?: string[];
}

export function makeLeads(ctx: Context) {
  return {
    list(orgId: string): Promise<Lead[]> {
      return ctx.db.leads.list(orgId);
    },

    async create(input: CreateLeadInput): Promise<Lead> {
      const lead: Lead = {
        id: newId('lead'),
        orgId: input.orgId,
        name: input.name,
        company: input.company ?? '',
        title: input.title ?? '',
        phone: input.phone ?? '',
        email: input.email ?? '',
        stage: 'new',
        source: input.source ?? 'manual',
        what: input.what ?? '',
        createdBy: input.actorId,
        assignedTo: input.assignedTo ?? [input.actorId],
        createdAt: now(),
      };
      await ctx.db.leads.insert(lead);
      await record(ctx, { orgId: lead.orgId, type: 'lead.created', entityId: lead.id, actorId: input.actorId, channel: lead.source, undo: { delete: lead.id } });
      return lead;
    },

    async advance(id: string, actorId: string): Promise<Lead> {
      const cur = await ctx.db.leads.get(id);
      if (!cur) throw new Error(`lead ${id} not found`);
      const idx = STAGE_ORDER.indexOf(cur.stage);
      const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.indexOf('won'))]!;
      const lead = await ctx.db.leads.update(id, { stage: next });
      await record(ctx, { orgId: lead.orgId, type: 'lead.advanced', entityId: id, actorId, undo: { restoreStage: cur.stage } });
      return lead;
    },

    /**
     * "Quick-add from a phone number + rough note" → a structured lead.
     * The AI extraction is stubbed here; the server injects the real LLM call server-side.
     */
    async quickAddFromNote(
      input: { orgId: string; actorId: string; phone: string; note: string },
      extract?: (note: string) => Promise<Partial<Lead>>,
    ): Promise<Lead> {
      const guessed = extract ? await extract(input.note) : { name: input.note.split(/\s+/).slice(0, 2).join(' ') || 'New lead', what: input.note };
      return this.create({
        orgId: input.orgId,
        actorId: input.actorId,
        name: guessed.name ?? 'New lead',
        company: guessed.company,
        title: guessed.title,
        phone: input.phone,
        email: guessed.email,
        source: 'whatsapp',
        what: guessed.what ?? input.note,
      });
    },
  };
}

export type LeadService = ReturnType<typeof makeLeads>;
