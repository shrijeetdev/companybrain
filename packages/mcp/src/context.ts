// Per-tool-call context: the actor, lazy lookups (members, projects, org), name → id
// resolution, due-date parsing in the member's time zone, and compact task formatting.

import type { Actor, AppServices, Member, OrgSettings, ProjectSummary, TaskActivity, TaskView } from '@companybrain/types';
import { ToolInputError } from './errors.js';
import { humanDate, isoLocal, parseIso, relativeAgo, safeTimezone, zonedToUtc } from './dates.js';

const ID_RE = /^[a-z]+_[A-Za-z0-9]{6,32}$/;

export class CallContext {
  private membersP: Promise<Member[]> | null = null;
  private projectsP: Promise<ProjectSummary[]> | null = null;
  private meP: Promise<Member> | null = null;
  private orgP: Promise<OrgSettings | null> | null = null;
  readonly now: number;

  constructor(readonly services: AppServices, readonly actor: Actor, clock: () => number) {
    this.now = clock();
  }

  me(): Promise<Member> {
    return (this.meP ??= this.services.members.me(this.actor));
  }

  async timezone(): Promise<string> {
    try {
      return safeTimezone((await this.me()).timezone);
    } catch {
      return 'UTC';
    }
  }

  members(): Promise<Member[]> {
    return (this.membersP ??= this.services.members.list(this.actor));
  }

  projects(): Promise<ProjectSummary[]> {
    return (this.projectsP ??= this.services.projects.list(this.actor));
  }

  org(): Promise<OrgSettings | null> {
    return (this.orgP ??= this.services.org.get(this.actor).catch(() => null));
  }

  async memberName(id: string): Promise<string> {
    if (id === this.actor.memberId) {
      try { return `${(await this.me()).name} (you)`; } catch { return 'you'; }
    }
    if (id === 'system') return 'companybrain';
    try {
      const m = (await this.members()).find((x) => x.id === id);
      return m ? m.name : id;
    } catch {
      return id;
    }
  }

  // ─── Name → id resolution ──────────────────────────────────────────────────

  /** Resolve "me", an id, a name, an email or a unique (case-insensitive) prefix to a member id. */
  async resolveMember(ref: string): Promise<string> {
    const raw = ref.trim().replace(/^@/, '');
    if (!raw) throw new ToolInputError('Empty assignee. Pass a member id, a name (e.g. "Priya") or "me".');
    if (raw.toLowerCase() === 'me' || raw === this.actor.memberId) return this.actor.memberId;
    const members = await this.members();
    const byId = members.find((m) => m.id === raw);
    if (byId) return byId.id;
    const q = raw.toLowerCase();
    const exact = members.filter((m) => m.name.toLowerCase() === q || (m.email ?? '').toLowerCase() === q);
    if (exact.length === 1) return exact[0]!.id;
    if (exact.length > 1) throw ambiguous('member', raw, exact.map(describeMember));
    const prefix = members.filter((m) => m.name.toLowerCase().startsWith(q));
    if (prefix.length === 1) return prefix[0]!.id;
    if (prefix.length > 1) throw ambiguous('member', raw, prefix.map(describeMember));
    const word = members.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
    if (word.length === 1) return word[0]!.id;
    if (word.length > 1) throw ambiguous('member', raw, word.map(describeMember));
    if (ID_RE.test(raw)) return raw; // let core validate ids we can't see (e.g. inactive members)
    throw new ToolInputError(
      `No team member matches "${raw}". Team: ${members.slice(0, 30).map(describeMember).join('; ') || '(none visible)'}. Use list_team to see everyone.`,
      { kind: 'member', query: raw },
    );
  }

  async resolveMembers(refs: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const r of refs) {
      const id = await this.resolveMember(r);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  /** Resolve a project id, name or unique prefix ("#website" ok). "none" → null. */
  async resolveProject(ref: string): Promise<string | null> {
    const raw = ref.trim().replace(/^#/, '');
    if (!raw || raw.toLowerCase() === 'none') return null;
    const projects = await this.projects();
    const byId = projects.find((p) => p.id === raw);
    if (byId) return byId.id;
    const q = raw.toLowerCase();
    const exact = projects.filter((p) => p.name.toLowerCase() === q);
    if (exact.length === 1) return exact[0]!.id;
    if (exact.length > 1) throw ambiguous('project', raw, exact.map(describeProject));
    const prefix = projects.filter((p) => p.name.toLowerCase().startsWith(q));
    if (prefix.length === 1) return prefix[0]!.id;
    if (prefix.length > 1) throw ambiguous('project', raw, prefix.map(describeProject));
    const word = projects.filter((p) => p.name.toLowerCase().split(/[\s\-_/]+/).some((w) => w.startsWith(q)));
    if (word.length === 1) return word[0]!.id;
    if (word.length > 1) throw ambiguous('project', raw, word.map(describeProject));
    if (ID_RE.test(raw)) return raw;
    throw new ToolInputError(
      `No project matches "${raw}". Projects: ${projects.slice(0, 30).map(describeProject).join('; ') || '(none)'}. Use list_projects to see them all.`,
      { kind: 'project', query: raw },
    );
  }

  // ─── Dates ─────────────────────────────────────────────────────────────────

  /**
   * Parse a due date: ISO 8601 (with offset = exact instant; without = member's local time;
   * date only = all-day, due at end of the workday) or natural language ("tomorrow 5pm",
   * "next friday", "in 3 days") via the quick-add parser — always in the member's time zone.
   */
  async parseDue(input: string): Promise<{ dueAt: number; dueAllDay: boolean }> {
    const tz = await this.timezone();
    const iso = parseIso(input);
    if (iso?.kind === 'instant') return { dueAt: iso.ms, dueAllDay: false };
    if (iso?.kind === 'local') {
      return { dueAt: zonedToUtc(iso.year, iso.month, iso.day, iso.hour, iso.minute, tz, iso.second), dueAllDay: false };
    }
    if (iso?.kind === 'date') {
      const org = await this.org();
      const hour = Math.min(23, Math.max(0, org?.workdayEnd ?? 18));
      return { dueAt: zonedToUtc(iso.year, iso.month, iso.day, hour, 0, tz), dueAllDay: true };
    }
    const preview = await this.services.tasks.preview(this.actor, `Task due ${input.trim()}`);
    const dueAt = preview.draft.dueAt ?? preview.parsed.dueAt;
    if (dueAt == null) {
      throw new ToolInputError(
        `Could not understand the date "${input}". Use ISO 8601 (e.g. "2026-10-12T17:00" in your time zone ${tz}, ` +
        `"2026-10-12T17:00:00Z", or "2026-10-12" for all day) or a phrase like "tomorrow 5pm", "next friday", "in 3 days".`,
      );
    }
    return { dueAt, dueAllDay: preview.draft.dueAllDay ?? preview.parsed.dueAllDay ?? false };
  }

  /** Parse a range bound (ISO or natural language). */
  async parseInstant(input: string): Promise<number> {
    return (await this.parseDue(input)).dueAt;
  }

  // ─── Formatting ────────────────────────────────────────────────────────────

  async compactTask(t: TaskView): Promise<CompactTask> {
    const tz = await this.timezone();
    const assignees = await Promise.all(t.assigneeIds.map(async (id) => ({ id, name: await this.memberName(id) })));
    let project: { id: string; name: string } | null = null;
    if (t.projectId) {
      const p = (await this.projects().catch(() => [] as ProjectSummary[])).find((x) => x.id === t.projectId);
      project = { id: t.projectId, name: p?.name ?? t.projectId };
    }
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due: t.dueAt != null ? (t.dueAllDay ? isoLocal(t.dueAt, tz).slice(0, 10) : isoLocal(t.dueAt, tz)) : null,
      dueAt: t.dueAt,
      dueAllDay: t.dueAllDay,
      isOverdue: t.isOverdue,
      isDueToday: t.isDueToday,
      isStale: t.isStale,
      assignees,
      project,
      tags: t.tags,
      waitingOn: t.waitingOn ? t.waitingOn.name : null,
      commentCount: t.commentCount,
      lastActivity: isoLocal(t.lastActivityAt, tz),
    };
  }

  async compactTasks(ts: TaskView[]): Promise<CompactTask[]> {
    return Promise.all(ts.map((t) => this.compactTask(t)));
  }

  /** One line: "- Send Acme proposal [task_abc] · in progress · high · due Mon 12 Oct 17:00 (OVERDUE) · → Priya · #Website" */
  async taskLine(t: CompactTask): Promise<string> {
    const tz = await this.timezone();
    const bits = [`- ${t.title} [${t.id}]`, t.status.replace('_', ' ')];
    if (t.priority !== 'none' && t.priority !== 'medium') bits.push(t.priority);
    if (t.dueAt != null) {
      let due = `due ${humanDate(t.dueAt, tz, this.now, t.dueAllDay)}`;
      if (t.isOverdue) due += ' (OVERDUE)';
      else if (t.isDueToday) due += ' (today)';
      bits.push(due);
    }
    if (t.assignees.length) bits.push(`→ ${t.assignees.map((a) => a.name).join(', ')}`);
    if (t.project) bits.push(`#${t.project.name}`);
    if (t.tags.length) bits.push(t.tags.map((x) => `+${x}`).join(' '));
    if (t.waitingOn) bits.push(`waiting on ${t.waitingOn}`);
    if (t.isStale) bits.push('STALE (no agent activity)');
    return bits.join(' · ');
  }

  async taskLines(ts: CompactTask[]): Promise<string> {
    return (await Promise.all(ts.map((t) => this.taskLine(t)))).join('\n');
  }

  async activityEntry(a: TaskActivity): Promise<{ id: string; kind: string; by: { id: string; name: string }; text: string; at: string }> {
    const tz = await this.timezone();
    return { id: a.id, kind: a.kind, by: { id: a.actorId, name: await this.memberName(a.actorId) }, text: a.text, at: isoLocal(a.at, tz) };
  }

  async when(ms: number): Promise<string> {
    return `${humanDate(ms, await this.timezone(), this.now)} (${relativeAgo(ms, this.now)})`;
  }
}

export interface CompactTask {
  id: string;
  title: string;
  status: TaskView['status'];
  priority: TaskView['priority'];
  /** ISO 8601 in the member's zone (date only for all-day tasks). */
  due: string | null;
  dueAt: number | null;
  dueAllDay: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  isStale: boolean;
  assignees: { id: string; name: string }[];
  project: { id: string; name: string } | null;
  tags: string[];
  waitingOn: string | null;
  commentCount: number;
  lastActivity: string;
}

function describeMember(m: Member): string {
  return `${m.name} (${m.id}${m.kind === 'agent' ? ', agent' : ''})`;
}

function describeProject(p: ProjectSummary): string {
  return `${p.name} (${p.id})`;
}

function ambiguous(kind: 'member' | 'project', q: string, candidates: string[]): ToolInputError {
  return new ToolInputError(
    `"${q}" matches more than one ${kind}: ${candidates.join('; ')}. Pass the exact id or full name.`,
    { kind, query: q, candidates },
  );
}
