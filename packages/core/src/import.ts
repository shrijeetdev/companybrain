// CSV Import service — parse CSV data and import into loops/tasks/leads.

import type { Context } from './context';
import type { LoopSide, LoopStatus, TaskDay, Priority, Channel, LeadStage } from '@companybrain/types';

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text: string): string[][] {
  return text.split('\n').filter(line => line.trim()).map(parseCsvRow);
}

function getHeaderIndex(headers: string[], name: string): number | null {
  const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx : null;
}

function getField(row: string[] | undefined, idx: number | null, fallback = ''): string {
  if (idx === null || !row) return fallback;
  return row[idx] ?? fallback;
}

export function makeImporter(ctx: Context) {
  async function importLoops(csvText: string, orgId: string, actorId: string): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, failed: 0, errors: [] };
    const rows = parseCsv(csvText);
    if (rows.length < 2) return result;

    const headers = rows[0] ?? [];
    const titleIdx = getHeaderIndex(headers, 'title');
    const channelIdx = getHeaderIndex(headers, 'channel');
    const whyIdx = getHeaderIndex(headers, 'why');
    const sideIdx = getHeaderIndex(headers, 'side');
    const statusIdx = getHeaderIndex(headers, 'status');

    for (let i = 1; i < rows.length; i++) {
      try {
        const row = rows[i];
        const title = getField(row, titleIdx, `Imported loop ${i}`);
        if (!title) { result.failed++; continue; }

        await ctx.db.loops.insert({
          id: `loop_import_${Date.now()}_${i}`,
          orgId,
          title,
          why: getField(row, whyIdx),
          side: getField(row, sideIdx, 'yours') as LoopSide,
          status: getField(row, statusIdx, 'open') as LoopStatus,
          channel: getField(row, channelIdx, 'manual') as Channel,
          createdBy: actorId,
          assignedTo: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        result.imported++;
      } catch (e: any) {
        result.errors.push(`Row ${i}: ${e.message}`);
        result.failed++;
      }
    }
    return result;
  }

  async function importTasks(csvText: string, orgId: string, actorId: string): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, failed: 0, errors: [] };
    const rows = parseCsv(csvText);
    if (rows.length < 2) return result;

    const headers = rows[0] ?? [];
    const titleIdx = getHeaderIndex(headers, 'title');
    const dayIdx = getHeaderIndex(headers, 'day');
    const priorityIdx = getHeaderIndex(headers, 'priority');
    const assigneesIdx = getHeaderIndex(headers, 'assignees');
    const dueIdx = getHeaderIndex(headers, 'duedate');

    for (let i = 1; i < rows.length; i++) {
      try {
        const row = rows[i];
        const title = getField(row, titleIdx, `Imported task ${i}`);
        if (!title) { result.failed++; continue; }

        const dayRaw = getField(row, dayIdx, 'today');
        const validDays = ['today', 'tomorrow', 'upcoming'];
        const day = validDays.includes(dayRaw) ? dayRaw as TaskDay : 'today';

        const priorityRaw = getField(row, priorityIdx, '');
        const validPriorities = ['low', 'med', 'high'];
        const priority = validPriorities.includes(priorityRaw) ? priorityRaw as Priority : null;

        const assigneesRaw = getField(row, assigneesIdx, '');
        const assignees = assigneesRaw ? assigneesRaw.split(';').map((s: string) => s.trim()).filter(Boolean) : [];

        const dueRaw = getField(row, dueIdx, '');
        const dueAt = dueRaw ? new Date(dueRaw).getTime() : undefined;

        await ctx.db.tasks.insert({
          id: `task_import_${Date.now()}_${i}`,
          orgId,
          title,
          emoji: '📋',
          list: 'imported',
          day,
          priority,
          recurring: false,
          assignees,
          createdBy: actorId,
          subtasks: [],
          comments: [],
          dueAt: dueAt ?? null,
          createdAt: Date.now(),
        });
        result.imported++;
      } catch (e: any) {
        result.errors.push(`Row ${i}: ${e.message}`);
        result.failed++;
      }
    }
    return result;
  }

  async function importLeads(csvText: string, orgId: string, actorId: string): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, failed: 0, errors: [] };
    const rows = parseCsv(csvText);
    if (rows.length < 2) return result;

    const headers = rows[0] ?? [];
    const nameIdx = getHeaderIndex(headers, 'name');
    const companyIdx = getHeaderIndex(headers, 'company');
    const titleIdx = getHeaderIndex(headers, 'title');
    const stageIdx = getHeaderIndex(headers, 'stage');
    const whatIdx = getHeaderIndex(headers, 'what');
    const notesIdx = getHeaderIndex(headers, 'notes');

    for (let i = 1; i < rows.length; i++) {
      try {
        const row = rows[i];
        const name = getField(row, nameIdx, `Imported lead ${i}`);
        if (!name) { result.failed++; continue; }

        const stageRaw = getField(row, stageIdx, 'new');
        const validStages = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
        const stage = validStages.includes(stageRaw) ? stageRaw as LeadStage : 'new';

        await ctx.db.leads.insert({
          id: `lead_import_${Date.now()}_${i}`,
          orgId,
          name,
          company: getField(row, companyIdx),
          title: getField(row, titleIdx),
          phone: '',
          email: '',
          stage,
          source: 'manual',
          what: getField(row, whatIdx, getField(row, notesIdx)),
          createdBy: actorId,
          assignedTo: [],
          createdAt: Date.now(),
        });
        result.imported++;
      } catch (e: any) {
        result.errors.push(`Row ${i}: ${e.message}`);
        result.failed++;
      }
    }
    return result;
  }

  return { importLoops, importTasks, importLeads, parseCsv };
}

export type Importer = ReturnType<typeof makeImporter>;
