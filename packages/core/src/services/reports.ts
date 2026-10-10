// Reports (over the tasks the actor can see) and ⌘K search.

import type { Report, ReportService, SearchService, Task } from '@companybrain/types';
import { localDateKey, safeTz, startOfLocalDay } from '@companybrain/db';
import { actorTz, type Ctx } from '../context.js';
import { visibility } from '../perms.js';
import * as v from '../validate.js';

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function createReportService(ctx: Ctx): ReportService {
  const { db } = ctx;
  return {
    async get(actor, windowDays) {
      const days = windowDays === undefined || windowDays === null ? 30 : v.int(windowDays, 'days', 1, 365);
      const t0 = ctx.clock();
      const org = db.orgs.get(actor.orgId);
      const tz = safeTz(org?.timezone);
      const start = startOfLocalDay(t0, tz, -(days - 1));
      const vis = visibility(actor);
      const created = db.tasks.query(actor.orgId, { visibility: vis, createdAfter: start, limit: 5000 });
      const completed = db.tasks.query(actor.orgId, { visibility: vis, statuses: ['done'], completedAfter: start, limit: 5000 });
      const openNow = db.tasks.query(actor.orgId, { visibility: vis, open: true, limit: 5000 });
      const overdueNow = openNow.filter((t) => t.dueAt !== null && t.dueAt < t0);

      const onTime = (ts: Task[]) => {
        const withDue = ts.filter((t) => t.dueAt !== null && t.completedAt !== null);
        return withDue.length ? round(withDue.filter((t) => t.completedAt! <= t.dueAt!).length / withDue.length, 3) : 1;
      };
      const cycles = completed.filter((t) => t.completedAt !== null).map((t) => (t.completedAt! - t.createdAt) / 3_600_000);

      const daily: Report['daily'] = [];
      const idx = new Map<string, Report['daily'][number]>();
      for (let i = 0; i < days; i++) {
        const key = localDateKey(startOfLocalDay(start, tz, i), tz);
        const row = { date: key, created: 0, completed: 0 };
        daily.push(row);
        idx.set(key, row);
      }
      for (const t of created) {
        const r = idx.get(localDateKey(t.createdAt, tz));
        if (r) r.created++;
      }
      for (const t of completed) {
        const r = idx.get(localDateKey(t.completedAt!, tz));
        if (r) r.completed++;
      }

      const members = db.members.list(actor.orgId);
      const byMember = members.map((m) => {
        const done = completed.filter((t) => t.assigneeIds.includes(m.id));
        return { memberId: m.id, completed: done.length, overdue: overdueNow.filter((t) => t.assigneeIds.includes(m.id)).length, onTimeRate: onTime(done) };
      });

      const projects = new Map<string | null, { projectId: string | null; open: number; completed: number }>();
      const bucket = (id: string | null) => {
        if (!projects.has(id)) projects.set(id, { projectId: id, open: 0, completed: 0 });
        return projects.get(id)!;
      };
      for (const t of openNow) bucket(t.projectId).open++;
      for (const t of completed) bucket(t.projectId).completed++;

      const kind = new Map(db.members.list(actor.orgId, { includeInactive: true }).map((m) => [m.id, m.kind]));
      let humans = 0;
      let agents = 0;
      for (const t of completed) {
        if (t.completedBy && kind.get(t.completedBy) === 'agent') agents++;
        else humans++;
      }

      return {
        windowDays: days,
        generatedAt: t0,
        totals: {
          created: created.length,
          completed: completed.length,
          overdueNow: overdueNow.length,
          onTimeRate: onTime(completed),
          avgCycleHours: cycles.length ? round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0,
        },
        daily,
        byMember,
        byProject: [...projects.values()],
        humansVsAgents: { humans, agents },
      };
    },
  };
}

export function createSearchService(ctx: Ctx): SearchService {
  const { db } = ctx;
  return {
    async search(actor, q, limit) {
      const query = typeof q === 'string' ? q.trim().slice(0, 200) : '';
      const n = limit === undefined ? 10 : v.int(limit, 'limit', 1, 50);
      if (!query) return { tasks: [], projects: [], members: [] };
      const lc = query.toLowerCase();
      const tasks = ctx.internal.views(actor.orgId, db.tasks.query(actor.orgId, { visibility: visibility(actor), search: query, order: 'updated', limit: n }), actorTz(ctx, actor));
      const projects = db.projects.list(actor.orgId, { visibility: visibility(actor), includeArchived: true }).filter((p) => p.name.toLowerCase().includes(lc) || p.description.toLowerCase().includes(lc)).slice(0, n);
      const members = db.members.list(actor.orgId).filter((m) => m.name.toLowerCase().includes(lc) || (m.email ?? '').toLowerCase().includes(lc) || (m.title ?? '').toLowerCase().includes(lc)).slice(0, n);
      return { tasks, projects, members };
    },
  };
}
