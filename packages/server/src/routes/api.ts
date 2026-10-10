// Authenticated REST routes (`/api/*`). Each maps 1:1 to a service method.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@companybrain/types';
import type { ServerDeps } from '../types';
import { apiRoute as r, empty, json, type RouteDef } from '../route';
import { requireRole, requireScope } from '../auth';
import * as S from '../schemas';
import { baseUrl } from '../origin';

const Ok = { ok: true } as const;
const DAY = 86_400_000;

/** Server TTS costs money per call: per-member sliding-window limit + a short per-text cache. */
export const TTS_MAX_PER_HOUR = 20;
export const TTS_CACHE_MS = 10 * 60_000;

export function apiRoutes(deps: ServerDeps): RouteDef[] {
  const s = deps.services;
  const now = () => (deps.clock ?? Date.now)();
  const ttsCalls = new Map<string, number[]>();
  const ttsCache = new Map<string, { hash: string; at: number; audio: Buffer; mime: string }>();

  return [
    // ─── Me & briefing ─────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/me', operationId: 'getMe', tag: 'Me', summary: 'The authenticated member',
      response: json(S.MemberDto),
      handler: ({ actor }) => s.members.me(actor),
    }),
    r({
      method: 'PATCH', path: '/api/me', operationId: 'updateMe', tag: 'Me', summary: 'Update own profile/preferences',
      body: S.UpdateMeBody, response: json(S.MemberDto),
      handler: ({ actor, body }) => s.members.update(actor, actor.memberId, body),
    }),
    r({
      method: 'POST', path: '/api/me/password', operationId: 'changeMyPassword', tag: 'Me', summary: 'Change own password',
      body: S.ChangePasswordBody, response: json(S.OkDto),
      handler: async ({ actor, body }) => {
        await s.members.changeOwnPassword(actor, body.current, body.next);
        return Ok;
      },
    }),
    r({
      method: 'GET', path: '/api/briefing', operationId: 'getBriefing', tag: 'Me', summary: 'Personal daily briefing (tasks, meetings, team, agents)',
      response: json(S.BriefingDto),
      handler: ({ actor }) => s.briefing.get(actor),
    }),
    r({
      method: 'POST', path: '/api/briefing/audio', operationId: 'briefingAudio', tag: 'Me',
      summary: 'Server text-to-speech for the briefing (204 when no TTS provider is configured)',
      body: S.AudioBody,
      response: { kind: 'binary', mime: 'audio/mpeg', description: 'Audio bytes (provider-specific audio/* type), or 204 without TTS', alsoEmpty: true },
      handler: async ({ actor, body, reply }) => {
        if (actor.via !== 'session' || actor.kind !== 'human' || actor.role === 'guest') {
          throw new AppError('forbidden', 'Briefing audio is only available to signed-in team members');
        }
        if (!deps.tts) return reply.code(204).send();
        const text = body.text.slice(0, 2000);
        const t = now();
        const key = `${actor.orgId}:${actor.memberId}`;
        const hash = createHash('sha256').update(`${body.voice ?? ''}\n${text}`).digest('hex');
        const send = (audio: Buffer, mime: string) => reply.code(200).header('cache-control', 'no-store').type(mime || 'audio/mpeg').send(audio);
        const cached = ttsCache.get(key);
        if (cached && cached.hash === hash && t - cached.at < TTS_CACHE_MS) return send(cached.audio, cached.mime);
        const recent = (ttsCalls.get(key) ?? []).filter((x) => t - x < 3_600_000);
        if (recent.length >= TTS_MAX_PER_HOUR) {
          reply.header('retry-after', Math.ceil((recent[0]! + 3_600_000 - t) / 1000));
          throw new AppError('rate_limited', `Briefing audio is limited to ${TTS_MAX_PER_HOUR} per hour`);
        }
        recent.push(t);
        ttsCalls.set(key, recent);
        const out = await deps.tts.synthesize(text, body.voice ? { voice: body.voice } : undefined);
        if (!out) return reply.code(204).send();
        const audio = out.audio;
        ttsCache.set(key, { hash, at: t, audio, mime: out.mime });
        return send(audio, out.mime);
      },
    }),

    // ─── Tasks ─────────────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/tasks', operationId: 'listTasks', tag: 'Tasks', summary: 'List/filter tasks',
      description: '`status` and `priority` are comma-separated. `assigneeId=me` = the caller. `completedSince` (epoch ms) limits closed tasks to those closed since then (open tasks unaffected).',
      query: S.TaskListQuery, response: json(z.array(S.TaskViewDto)),
      handler: ({ actor, query }) => s.tasks.list(actor, stripUndefined(query)),
    }),
    r({
      method: 'POST', path: '/api/tasks', operationId: 'createTask', tag: 'Tasks', summary: 'Create a task',
      body: S.CreateTaskBody, response: json(S.TaskViewDto),
      handler: ({ actor, body }) => s.tasks.create(actor, body),
    }),
    r({
      method: 'POST', path: '/api/tasks/quick', operationId: 'quickAddTask', tag: 'Tasks',
      summary: 'Create a task from natural language, e.g. "Send Acme proposal tomorrow 5pm @priya #website !high"',
      body: S.QuickAddBody, response: json(S.TaskViewDto),
      handler: ({ actor, body }) => s.tasks.quickAdd(actor, body.text, body.defaults),
    }),
    r({
      method: 'POST', path: '/api/tasks/preview', operationId: 'previewQuickAdd', tag: 'Tasks', summary: 'Parse natural language without creating',
      body: S.PreviewBody,
      response: json(z.object({ parsed: S.ParsedQuickAddDto, draft: S.TaskDraftDto, unresolved: z.array(z.string()) })),
      handler: ({ actor, body }) => s.tasks.preview(actor, body.text),
    }),
    r({
      method: 'POST', path: '/api/tasks/bulk', operationId: 'bulkTasks', tag: 'Tasks', summary: 'Apply one operation to many tasks',
      body: S.BulkBody,
      response: json(z.object({ ok: z.array(z.string()), failed: z.array(z.object({ id: z.string(), error: z.string() })) })),
      handler: ({ actor, body }) => s.tasks.bulk(actor, body.ids, body.op),
    }),
    r({
      method: 'GET', path: '/api/tasks/:id', operationId: 'getTask', tag: 'Tasks', summary: 'Get a task',
      params: S.IdParams, response: json(S.TaskViewDto),
      handler: ({ actor, params }) => s.tasks.get(actor, params.id),
    }),
    r({
      method: 'PATCH', path: '/api/tasks/:id', operationId: 'updateTask', tag: 'Tasks', summary: 'Update a task',
      params: S.IdParams, body: S.UpdateTaskBody, response: json(S.TaskViewDto),
      handler: ({ actor, params, body }) => s.tasks.update(actor, params.id, body),
    }),
    r({
      method: 'DELETE', path: '/api/tasks/:id', operationId: 'deleteTask', tag: 'Tasks', summary: 'Delete a task (undo with POST /api/audit/{auditId}/undo)',
      params: S.IdParams, response: json(S.DeletedDto),
      handler: ({ actor, params }) => s.tasks.remove(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/tasks/:id/complete', operationId: 'completeTask', tag: 'Tasks', summary: 'Mark a task done',
      params: S.IdParams, response: json(S.TaskViewDto),
      handler: ({ actor, params }) => s.tasks.complete(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/tasks/:id/reopen', operationId: 'reopenTask', tag: 'Tasks', summary: 'Reopen a task',
      params: S.IdParams, response: json(S.TaskViewDto),
      handler: ({ actor, params }) => s.tasks.reopen(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/tasks/:id/nudge', operationId: 'nudgeTask', tag: 'Tasks', summary: 'Nudge the party the task is waiting on',
      params: S.IdParams, response: json(S.TaskViewDto),
      handler: ({ actor, params }) => s.tasks.nudge(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/tasks/:id/subtasks', operationId: 'addSubtask', tag: 'Tasks', summary: 'Add a subtask',
      params: S.IdParams, body: S.SubtaskCreateBody, response: json(S.TaskViewDto),
      handler: ({ actor, params, body }) => s.tasks.addSubtask(actor, params.id, body.title),
    }),
    r({
      method: 'PATCH', path: '/api/tasks/:id/subtasks/:subId', operationId: 'updateSubtask', tag: 'Tasks', summary: 'Update a subtask',
      params: S.SubtaskParams, body: S.SubtaskPatchBody, response: json(S.TaskViewDto),
      handler: ({ actor, params, body }) => s.tasks.updateSubtask(actor, params.id, params.subId, body),
    }),
    r({
      method: 'DELETE', path: '/api/tasks/:id/subtasks/:subId', operationId: 'deleteSubtask', tag: 'Tasks', summary: 'Remove a subtask',
      params: S.SubtaskParams, response: json(S.TaskViewDto),
      handler: ({ actor, params }) => s.tasks.removeSubtask(actor, params.id, params.subId),
    }),
    r({
      method: 'PUT', path: '/api/tasks/:id/subtasks/order', operationId: 'reorderSubtasks', tag: 'Tasks', summary: 'Reorder subtasks',
      description: '`ids` must contain exactly the current subtask ids (in the new order).',
      params: S.IdParams, body: S.SubtaskOrderBody, response: json(S.TaskViewDto),
      handler: ({ actor, params, body }) => s.tasks.reorderSubtasks(actor, params.id, body.ids),
    }),
    r({
      method: 'GET', path: '/api/tasks/:id/activity', operationId: 'taskActivity', tag: 'Tasks', summary: 'Task activity timeline',
      params: S.IdParams, response: json(z.array(S.ActivityDto)),
      handler: ({ actor, params }) => s.tasks.activity(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/tasks/:id/comments', operationId: 'commentOnTask', tag: 'Tasks', summary: 'Comment or leave a hand-off note',
      params: S.IdParams, body: S.CommentBody, response: json(S.ActivityDto),
      handler: ({ actor, params, body }) => s.tasks.comment(actor, params.id, body.text, body.kind),
    }),

    // ─── Projects ──────────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/projects', operationId: 'listProjects', tag: 'Projects', summary: 'List projects',
      query: S.ProjectListQuery, response: json(z.array(S.ProjectSummaryDto)),
      handler: ({ actor, query }) => s.projects.list(actor, { includeArchived: query.includeArchived ?? false }),
    }),
    r({
      method: 'POST', path: '/api/projects', operationId: 'createProject', tag: 'Projects', summary: 'Create a project',
      body: S.CreateProjectBody, response: json(S.ProjectSummaryDto),
      handler: ({ actor, body }) => s.projects.create(actor, body),
    }),
    r({
      method: 'GET', path: '/api/projects/:id', operationId: 'getProject', tag: 'Projects', summary: 'Get a project',
      params: S.IdParams, response: json(S.ProjectSummaryDto),
      handler: ({ actor, params }) => s.projects.get(actor, params.id),
    }),
    r({
      method: 'PATCH', path: '/api/projects/:id', operationId: 'updateProject', tag: 'Projects', summary: 'Update a project',
      params: S.IdParams, body: S.UpdateProjectBody, response: json(S.ProjectSummaryDto),
      handler: ({ actor, params, body }) => s.projects.update(actor, params.id, body),
    }),
    r({
      method: 'DELETE', path: '/api/projects/:id', operationId: 'deleteProject', tag: 'Projects', summary: 'Delete a project',
      params: S.IdParams, response: empty,
      handler: ({ actor, params }) => s.projects.remove(actor, params.id),
    }),

    // ─── Members ───────────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/members', operationId: 'listMembers', tag: 'Members', summary: 'List team members (humans and AI agents)',
      query: S.MemberListQuery, response: json(z.array(S.MemberDto)),
      handler: ({ actor, query }) => s.members.list(actor, stripUndefined(query)),
    }),
    r({
      method: 'POST', path: '/api/members', operationId: 'createMember', tag: 'Members', summary: 'Create a member or AI agent',
      body: S.CreateMemberBody, response: json(S.MemberDto),
      handler: ({ actor, body }) => s.members.create(actor, body),
    }),
    r({
      method: 'GET', path: '/api/members/:id', operationId: 'getMember', tag: 'Members', summary: 'Get a member',
      params: S.IdParams, response: json(S.MemberDto),
      handler: ({ actor, params }) => s.members.get(actor, params.id),
    }),
    r({
      method: 'PATCH', path: '/api/members/:id', operationId: 'updateMember', tag: 'Members', summary: 'Update a member',
      params: S.IdParams, body: S.UpdateMemberBody, response: json(S.MemberDto),
      handler: ({ actor, params, body }) => s.members.update(actor, params.id, body),
    }),
    r({
      method: 'DELETE', path: '/api/members/:id', operationId: 'deleteMember', tag: 'Members', summary: 'Deactivate a member',
      params: S.IdParams, response: empty,
      handler: ({ actor, params }) => s.members.remove(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/members/:id/password', operationId: 'setMemberPassword', tag: 'Members', summary: "Set a member's password (admin+)",
      params: S.IdParams, body: S.SetPasswordBody, response: json(S.OkDto),
      handler: async ({ actor, params, body }) => {
        await s.members.setPassword(actor, params.id, body.password);
        return Ok;
      },
    }),

    // ─── API keys ──────────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/keys', operationId: 'listApiKeys', tag: 'API keys', summary: 'List API keys',
      query: S.KeyListQuery, response: json(z.array(S.ApiKeyDto)),
      handler: ({ actor, query }) => s.apiKeys.list(actor, query.memberId),
    }),
    r({
      method: 'POST', path: '/api/keys', operationId: 'createApiKey', tag: 'API keys', summary: 'Mint an API key (raw key returned once)',
      body: S.CreateKeyBody, response: json(z.object({ key: S.ApiKeyDto, raw: z.string() })),
      handler: ({ actor, body }) => s.apiKeys.create(actor, body),
    }),
    r({
      method: 'DELETE', path: '/api/keys/:id', operationId: 'revokeApiKey', tag: 'API keys', summary: 'Revoke an API key',
      params: S.IdParams, response: empty,
      handler: ({ actor, params }) => s.apiKeys.revoke(actor, params.id),
    }),

    // ─── Org ───────────────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/org', operationId: 'getOrg', tag: 'Org', summary: 'Organisation settings',
      response: json(S.OrgDto),
      handler: ({ actor }) => s.org.get(actor),
    }),
    r({
      method: 'PATCH', path: '/api/org', operationId: 'updateOrg', tag: 'Org', summary: 'Update organisation settings (admin+)',
      body: S.UpdateOrgBody, response: json(S.OrgDto),
      handler: ({ actor, body }) => s.org.update(actor, body),
    }),

    // ─── Meetings & feeds ──────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/meetings', operationId: 'listMeetings', tag: 'Meetings', summary: 'Meetings in a time range (default: next 7 days)',
      query: S.MeetingListQuery, response: json(z.array(S.MeetingDto)),
      handler: ({ actor, query }) => {
        const from = query.from ?? now() - DAY;
        const to = query.to ?? from + 8 * DAY;
        if (to < from) throw new AppError('bad_request', '`to` must be >= `from`');
        if (to - from > 400 * DAY) throw new AppError('bad_request', 'Range too large (max 400 days)');
        return s.meetings.list(actor, { from, to, ...(query.memberId ? { memberId: query.memberId } : {}) });
      },
    }),
    r({
      method: 'POST', path: '/api/meetings', operationId: 'createMeeting', tag: 'Meetings', summary: 'Create a meeting',
      body: S.CreateMeetingBody, response: json(S.MeetingDto),
      handler: ({ actor, body }) => s.meetings.create(actor, body),
    }),
    r({
      method: 'PATCH', path: '/api/meetings/:id', operationId: 'updateMeeting', tag: 'Meetings', summary: 'Update a meeting',
      params: S.IdParams, body: S.UpdateMeetingBody, response: json(S.MeetingDto),
      handler: ({ actor, params, body }) => s.meetings.update(actor, params.id, body),
    }),
    r({
      method: 'DELETE', path: '/api/meetings/:id', operationId: 'deleteMeeting', tag: 'Meetings', summary: 'Delete a meeting',
      params: S.IdParams, response: empty,
      handler: ({ actor, params }) => s.meetings.remove(actor, params.id),
    }),
    r({
      method: 'GET', path: '/api/calendar-feeds', operationId: 'listCalendarFeeds', tag: 'Meetings', summary: 'My ICS calendar feeds',
      response: json(z.array(S.CalendarFeedDto)),
      handler: ({ actor }) => s.meetings.listFeeds(actor),
    }),
    r({
      method: 'POST', path: '/api/calendar-feeds', operationId: 'addCalendarFeed', tag: 'Meetings', summary: 'Add a private ICS feed URL',
      body: S.CreateFeedBody, response: json(S.CalendarFeedDto),
      handler: ({ actor, body }) => s.meetings.addFeed(actor, body),
    }),
    r({
      method: 'DELETE', path: '/api/calendar-feeds/:id', operationId: 'deleteCalendarFeed', tag: 'Meetings', summary: 'Remove a feed',
      params: S.IdParams, response: empty,
      handler: ({ actor, params }) => s.meetings.removeFeed(actor, params.id),
    }),
    r({
      method: 'POST', path: '/api/calendar-feeds/:id/sync', operationId: 'syncCalendarFeed', tag: 'Meetings', summary: 'Sync a feed now',
      params: S.IdParams, response: json(S.CalendarFeedDto),
      handler: ({ actor, params }) => s.meetings.syncFeed(actor, params.id),
    }),

    // ─── Notifications & push ──────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/notifications', operationId: 'listNotifications', tag: 'Notifications', summary: 'My notifications',
      query: S.NotificationListQuery, response: json(z.array(S.NotificationDto)),
      handler: ({ actor, query }) =>
        s.notifications.list(actor, stripUndefined({ unreadOnly: query.unread, limit: query.limit })),
    }),
    r({
      method: 'GET', path: '/api/notifications/count', operationId: 'countNotifications', tag: 'Notifications', summary: 'Unread count',
      response: json(z.object({ unread: z.number().int() })),
      handler: async ({ actor }) => ({ unread: await s.notifications.unreadCount(actor) }),
    }),
    r({
      method: 'POST', path: '/api/notifications/read', operationId: 'markNotificationsRead', tag: 'Notifications', summary: 'Mark notifications read',
      body: S.MarkReadBody, response: json(S.OkDto),
      handler: async ({ actor, body }) => {
        await s.notifications.markRead(actor, body.ids);
        return Ok;
      },
    }),
    r({
      method: 'GET', path: '/api/push/vapid', operationId: 'getVapidKey', tag: 'Notifications', summary: 'Web Push VAPID public key',
      response: json(z.object({ publicKey: z.string().nullable() })),
      handler: async () => ({ publicKey: s.notifications.vapidPublicKey() }),
    }),
    r({
      method: 'POST', path: '/api/push/subscribe', operationId: 'subscribePush', tag: 'Notifications', summary: 'Register a Web Push subscription',
      body: S.PushSubscribeBody, response: json(S.OkDto),
      handler: async ({ actor, body, req }) => {
        await s.notifications.subscribePush(actor, { endpoint: body.endpoint, keys: body.keys }, String(req.headers['user-agent'] ?? '').slice(0, 300));
        return Ok;
      },
    }),
    r({
      method: 'POST', path: '/api/push/unsubscribe', operationId: 'unsubscribePush', tag: 'Notifications', summary: 'Remove a Web Push subscription',
      body: S.PushUnsubscribeBody, response: json(S.OkDto),
      handler: async ({ actor, body }) => {
        await s.notifications.unsubscribePush(actor, body.endpoint);
        return Ok;
      },
    }),

    // ─── Inbox, leads, reports, audit, search ──────────────────────────────
    r({
      method: 'GET', path: '/api/inbox', operationId: 'listInbox', tag: 'Inbox', summary: 'WhatsApp/email intake inbox',
      query: S.InboxListQuery, response: json(z.array(S.InboxItemDto)),
      handler: ({ actor, query }) => s.inbox.list(actor, stripUndefined(query)),
    }),
    r({
      method: 'POST', path: '/api/inbox/:id/convert', operationId: 'convertInboxItem', tag: 'Inbox', summary: 'Turn an inbox item into a task',
      params: S.IdParams, body: S.ConvertInboxBody, response: json(S.TaskViewDto),
      handler: ({ actor, params, body }) => s.inbox.convert(actor, params.id, body),
    }),
    r({
      method: 'POST', path: '/api/inbox/:id/dismiss', operationId: 'dismissInboxItem', tag: 'Inbox', summary: 'Dismiss an inbox item',
      params: S.IdParams, response: json(S.OkDto),
      handler: async ({ actor, params }) => {
        await s.inbox.dismiss(actor, params.id);
        return Ok;
      },
    }),
    r({
      method: 'GET', path: '/api/leads', operationId: 'listLeads', tag: 'Leads', summary: 'Sales leads',
      response: json(z.array(S.LeadDto)),
      handler: ({ actor }) => s.leads.list(actor),
    }),
    r({
      method: 'POST', path: '/api/leads', operationId: 'createLead', tag: 'Leads', summary: 'Create a lead',
      body: S.CreateLeadBody, response: json(S.LeadDto),
      handler: ({ actor, body }) => s.leads.create(actor, body),
    }),
    r({
      method: 'PATCH', path: '/api/leads/:id', operationId: 'updateLead', tag: 'Leads', summary: 'Update a lead',
      params: S.IdParams, body: S.UpdateLeadBody, response: json(S.LeadDto),
      handler: ({ actor, params, body }) => s.leads.update(actor, params.id, body),
    }),
    r({
      method: 'DELETE', path: '/api/leads/:id', operationId: 'deleteLead', tag: 'Leads', summary: 'Delete a lead',
      params: S.IdParams, response: empty,
      handler: ({ actor, params }) => s.leads.remove(actor, params.id),
    }),
    r({
      method: 'GET', path: '/api/reports', operationId: 'getReport', tag: 'Reports', summary: 'Throughput report',
      query: S.ReportQuery, response: json(S.ReportDto),
      handler: ({ actor, query }) => s.reports.get(actor, query.days ?? 30),
    }),
    r({
      method: 'GET', path: '/api/audit', operationId: 'listAudit', tag: 'Audit', summary: 'Audit log',
      query: S.AuditListQuery, response: json(z.array(S.AuditEventDto)),
      handler: ({ actor, query }) => s.audit.list(actor, stripUndefined(query)),
    }),
    r({
      method: 'POST', path: '/api/audit/:id/undo', operationId: 'undoAuditEvent', tag: 'Audit', summary: 'Undo an audited change',
      params: S.IdParams, response: json(S.AuditEventDto),
      handler: ({ actor, params }) => s.audit.undo(actor, params.id),
    }),
    r({
      method: 'GET', path: '/api/search', operationId: 'search', tag: 'Search', summary: 'Search tasks, projects and members',
      query: S.SearchQuery,
      response: json(z.object({ tasks: z.array(S.TaskViewDto), projects: z.array(S.ProjectDto), members: z.array(S.MemberDto) })),
      handler: ({ actor, query }) => s.search.search(actor, query.q, query.limit),
    }),

    // ─── Integrations ──────────────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/integrations', operationId: 'getIntegrations', tag: 'Integrations', summary: 'Integration status + MCP URL',
      response: json(S.IntegrationsDto),
      handler: async ({ req }) => ({ ...deps.integrations.status(), mcpUrl: `${baseUrl(deps.config.publicUrl, req)}/mcp` }),
    }),
    r({
      method: 'POST', path: '/api/integrations/whatsapp/qr/start', operationId: 'whatsappQrStart', tag: 'Integrations', summary: 'Start WhatsApp QR pairing (admin+)',
      response: json(z.object({ qr: z.string().nullable(), status: z.enum(['disconnected', 'pairing', 'connected']) })),
      handler: async ({ actor }) => {
        const qr = adminQr(deps, actor);
        await qr.start();
        const st = qr.status();
        return { qr: st.qr, status: st.status };
      },
    }),
    r({
      method: 'GET', path: '/api/integrations/whatsapp/qr/status', operationId: 'whatsappQrStatus', tag: 'Integrations', summary: 'WhatsApp QR pairing status (admin+)',
      response: json(S.QrStatusDto),
      handler: async ({ actor }) => {
        const st = adminQr(deps, actor, false).status();
        return { status: st.status, qr: st.qr, phone: st.phone ?? null };
      },
    }),
    r({
      method: 'POST', path: '/api/integrations/whatsapp/qr/logout', operationId: 'whatsappQrLogout', tag: 'Integrations', summary: 'Unlink WhatsApp QR session (admin+)',
      response: json(S.OkDto),
      handler: async ({ actor }) => {
        await adminQr(deps, actor).logout();
        return Ok;
      },
    }),
    r({
      method: 'POST', path: '/api/integrations/test', operationId: 'testIntegration', tag: 'Integrations', summary: 'Send a test message to yourself',
      body: S.TestChannelBody, response: json(z.object({ ok: z.boolean(), error: z.string().optional() })),
      handler: async ({ actor, body }) => {
        requireScope(actor, 'write');
        return deps.integrations.sendTest(actor, body.channel);
      },
    }),

    // ─── Game (Tactical Ops) ───────────────────────────────────────────────
    r({
      method: 'GET', path: '/api/game/hud', operationId: 'gameHud', tag: 'Game', summary: 'HUD: profile, mission progress, challenges',
      response: json(S.HudDto),
      handler: ({ actor }) => s.game.hud(actor),
    }),
    r({
      method: 'GET', path: '/api/game/profile', operationId: 'gameProfile', tag: 'Game', summary: 'Player profile (self or ?memberId)',
      query: S.GameMemberQuery, response: json(S.PlayerProfileDto),
      handler: ({ actor, query }) => s.game.profile(actor, query.memberId),
    }),
    r({
      method: 'GET', path: '/api/game/leaderboard', operationId: 'gameLeaderboard', tag: 'Game', summary: 'Leaderboard (humans and agents)',
      query: S.LeaderboardQuery, response: json(S.LeaderboardDto),
      handler: ({ actor, query }) => s.game.leaderboard(actor, query.period),
    }),
    r({
      method: 'GET', path: '/api/game/achievements', operationId: 'gameAchievements', tag: 'Game', summary: 'Achievement progress',
      query: S.GameMemberQuery, response: json(z.array(S.AchievementProgressDto)),
      handler: ({ actor, query }) => s.game.achievements(actor, query.memberId),
    }),
    r({
      method: 'GET', path: '/api/game/challenges', operationId: 'gameChallenges', tag: 'Game', summary: "Today's challenges",
      response: json(z.array(S.DailyChallengeDto)),
      handler: ({ actor }) => s.game.challenges(actor),
    }),
    r({
      method: 'GET', path: '/api/game/crates', operationId: 'gameCrates', tag: 'Game', summary: 'My loot crates',
      response: json(z.array(S.CrateDto)),
      handler: ({ actor }) => s.game.crates(actor),
    }),
    r({
      method: 'POST', path: '/api/game/crates/:id/open', operationId: 'gameOpenCrate', tag: 'Game', summary: 'Open a crate',
      params: S.IdParams, response: json(S.CrateDto),
      handler: ({ actor, params }) => s.game.openCrate(actor, params.id),
    }),
    r({
      method: 'GET', path: '/api/game/inventory', operationId: 'gameInventory', tag: 'Game', summary: 'Cosmetics inventory',
      response: json(z.array(S.InventoryItemDto)),
      handler: ({ actor }) => s.game.inventory(actor),
    }),
    r({
      method: 'POST', path: '/api/game/equip', operationId: 'gameEquip', tag: 'Game', summary: 'Equip title/frame/emote',
      body: S.EquipBody, response: json(S.PlayerProfileDto),
      handler: ({ actor, body }) => s.game.equip(actor, body),
    }),
    r({
      method: 'GET', path: '/api/game/feed', operationId: 'gameFeed', tag: 'Game', summary: 'Squad activity feed',
      query: S.LimitQuery, response: json(z.array(S.FeedItemDto)),
      handler: ({ actor, query }) => s.game.feed(actor, query.limit),
    }),
    r({
      method: 'GET', path: '/api/game/rewards', operationId: 'gameRewards', tag: 'Game', summary: 'My recent rewards',
      query: S.LimitQuery, response: json(z.array(S.RewardEventDto)),
      handler: ({ actor, query }) => s.game.rewards(actor, query.limit),
    }),
  ];
}

function adminQr(deps: ServerDeps, actor: import('@companybrain/types').Actor, mutation = true) {
  requireRole(actor, 'admin');
  if (mutation) requireScope(actor, 'write');
  const qr = deps.integrations.whatsappQr;
  if (!qr) throw new AppError('not_found', 'WhatsApp QR pairing is not enabled');
  return qr;
}

/** Drop undefined keys so services see `{}` instead of `{ key: undefined }`. */
function stripUndefined<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}
