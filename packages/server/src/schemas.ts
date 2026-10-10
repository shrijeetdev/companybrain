// Zod schemas: request validation (params/query/body) + response DTOs (OpenAPI docs only).
import { z } from 'zod';

// ─── Primitives ──────────────────────────────────────────────────────────────

export const ID_RE = /^[a-z]+_[A-Za-z0-9]{6,32}$/;
export const Id = z.string().regex(ID_RE, 'invalid id');
export const IdParams = z.object({ id: Id });
export const SubtaskParams = z.object({ id: Id, subId: Id });

const Epoch = z.number().int().min(0).max(8.64e15);
const Hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'expected hex color');
const Tz = z.string().min(1).max(64);
const ShortText = (max = 200) => z.string().trim().min(1).max(max);
const Email = z.string().trim().max(254).email();
const Phone = z.string().trim().max(32);
const HttpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'must be http(s)');

/** Query-string boolean: `1`, `true`, `yes` → true. */
const QBool = z.preprocess((v) => {
  if (Array.isArray(v)) v = v[v.length - 1];
  if (v === undefined || v === '') return undefined;
  return v === true || v === '1' || v === 'true' || v === 'yes';
}, z.boolean().optional());

const QInt = (min: number, max: number) =>
  z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v === '' ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

const QStr = (max = 200) => z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v), z.string().max(max).optional());

/** Comma-separated (or repeated) query list. */
const QList = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return undefined;
    const arr = Array.isArray(v) ? v : [v];
    return arr.flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);
  }, z.array(item).max(20).optional());

// ─── Enums ───────────────────────────────────────────────────────────────────

export const Role = z.enum(['owner', 'admin', 'manager', 'member', 'guest', 'agent']);
export const MemberKind = z.enum(['human', 'agent']);
export const AgentProvider = z.enum(['claude', 'chatgpt', 'gemini', 'cursor', 'copilot', 'n8n', 'custom']);
export const TaskStatus = z.enum(['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled']);
export const Priority = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export const Channel = z.enum(['manual', 'quick_add', 'voice', 'whatsapp', 'email', 'mcp', 'api', 'calendar', 'recurring', 'import']);
export const ProjectStatus = z.enum(['active', 'paused', 'done', 'archived']);
export const LeadStage = z.enum(['new', 'contacted', 'meeting', 'proposal', 'won', 'lost']);
export const ApiScope = z.enum(['read', 'write']);
export const AuditEntity = z.enum(['task', 'project', 'member', 'meeting', 'inbox', 'org', 'api_key', 'lead']);
export const InboxStatus = z.enum(['new', 'converted', 'dismissed']);

// ─── Shared input pieces ─────────────────────────────────────────────────────

export const Recurrence = z.object({
  freq: z.enum(['daily', 'weekdays', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365).default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: Epoch.nullable().optional(),
});

const ReminderOffsets = z.array(z.number().int().min(0).max(525_600)).max(10);
const Tags = z.array(z.string().trim().min(1).max(50)).max(30);

export const WaitingOnInput = z.object({
  name: ShortText(200),
  contact: z.string().trim().max(254).nullable().default(null),
  channel: z.enum(['whatsapp', 'email', 'other']).default('other'),
  nudgeEveryHours: z.number().int().min(1).max(24 * 30).nullable().default(null),
});

export const MemberPrefsInput = z
  .object({
    briefingVoice: z.enum(['auto', 'button', 'off']),
    voiceName: z.string().max(200).nullable(),
    digestHour: z.number().int().min(0).max(23).nullable(),
    notifyPush: z.boolean(),
    notifyWhatsapp: z.boolean(),
    notifyEmail: z.boolean(),
    quietStart: z.number().int().min(0).max(23).nullable(),
    quietEnd: z.number().int().min(0).max(23).nullable(),
    theme: z.enum(['tactical', 'classic']),
    sound: z.boolean(),
  })
  .partial()
  .strict();

export const TaskDraftInput = z.object({
  title: ShortText(500),
  notes: z.string().max(20_000).optional(),
  dueAt: Epoch.nullable().optional(),
  dueAllDay: z.boolean().optional(),
  priority: Priority.optional(),
  assigneeIds: z.array(Id).max(50).optional(),
  projectId: Id.nullable().optional(),
  tags: Tags.optional(),
  recurrence: Recurrence.nullable().optional(),
  reminderOffsets: ReminderOffsets.nullable().optional(),
  waitingOn: WaitingOnInput.nullable().optional(),
});

// ─── Auth ────────────────────────────────────────────────────────────────────

const Password = z.string().min(8).max(1024);

export const SetupBody = z.object({
  orgName: ShortText(200),
  name: ShortText(200),
  email: Email,
  password: Password,
  timezone: Tz,
});
export const LoginBody = z.object({ identifier: ShortText(254), password: z.string().min(1).max(1024) });

// ─── Me ──────────────────────────────────────────────────────────────────────

export const UpdateMeBody = z
  .object({
    name: ShortText(200),
    phone: Phone.nullable(),
    title: z.string().trim().max(200).nullable(),
    timezone: Tz,
    color: Hex,
    avatarUrl: HttpUrl.nullable(),
    prefs: MemberPrefsInput,
  })
  .partial()
  .strict();
export const ChangePasswordBody = z.object({ current: z.string().min(1).max(1024), next: Password });
export const AudioBody = z.object({ text: z.string().min(1).max(20_000), voice: z.string().max(200).optional() });

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const TaskListQuery = z.object({
  assigneeId: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v), z.union([z.literal('me'), z.literal('unassigned'), Id]).optional()),
  projectId: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v), z.union([z.literal('none'), Id]).optional()),
  status: QList(TaskStatus),
  view: z.preprocess(
    (v) => (Array.isArray(v) ? v[v.length - 1] : v),
    z.enum(['today', 'upcoming', 'overdue', 'waiting', 'done', 'all', 'agents']).optional(),
  ),
  search: QStr(200),
  tag: QStr(50),
  dueBefore: QInt(0, 8.64e15),
  dueAfter: QInt(0, 8.64e15),
  includeDone: QBool,
  limit: QInt(1, 500),
  offset: QInt(0, 1_000_000),
});

export const CreateTaskBody = TaskDraftInput.extend({
  status: TaskStatus.optional(),
  source: z
    .object({ channel: Channel.optional(), ref: z.string().max(500).nullable().optional(), from: z.string().max(254).nullable().optional() })
    .optional(),
  subtasks: z.array(z.object({ title: ShortText(500) })).max(100).optional(),
});

export const QuickAddBody = z.object({ text: ShortText(2000), defaults: CreateTaskBody.partial().optional() });
export const PreviewBody = z.object({ text: z.string().max(2000) });
export const BulkBody = z.object({
  ids: z.array(Id).min(1).max(500),
  op: z.object({ kind: z.enum(['complete', 'delete', 'assign', 'move', 'status']), value: z.unknown().optional() }),
});

export const UpdateTaskBody = z
  .object({
    title: ShortText(500),
    notes: z.string().max(20_000),
    status: TaskStatus,
    priority: Priority,
    assigneeIds: z.array(Id).max(50),
    projectId: Id.nullable(),
    dueAt: Epoch.nullable(),
    dueAllDay: z.boolean(),
    reminderOffsets: ReminderOffsets.nullable(),
    recurrence: Recurrence.nullable(),
    waitingOn: WaitingOnInput.nullable(),
    tags: Tags,
    order: z.number().finite(),
  })
  .partial()
  .strict();

export const SubtaskCreateBody = z.object({ title: ShortText(500) });
export const SubtaskPatchBody = z.object({ title: ShortText(500).optional(), done: z.boolean().optional() }).strict();
export const CommentBody = z.object({ text: ShortText(10_000), kind: z.enum(['comment', 'handoff']).optional() });

// ─── Projects ────────────────────────────────────────────────────────────────

export const ProjectListQuery = z.object({ includeArchived: QBool });
const ProjectFields = {
  name: ShortText(200),
  emoji: z.string().max(16),
  color: Hex,
  description: z.string().max(5000),
  leadId: Id.nullable(),
  memberIds: z.array(Id).max(500),
  dueAt: Epoch.nullable(),
};
export const CreateProjectBody = z.object(ProjectFields).partial().required({ name: true }).strict();
export const UpdateProjectBody = z
  .object({ ...ProjectFields, status: ProjectStatus })
  .partial()
  .strict();

// ─── Members ─────────────────────────────────────────────────────────────────

export const MemberListQuery = z.object({
  includeInactive: QBool,
  kind: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), MemberKind.optional()),
});
export const CreateMemberBody = z
  .object({
    kind: MemberKind,
    role: Role,
    name: ShortText(200),
    email: Email.nullable().optional(),
    phone: Phone.nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    timezone: Tz.optional(),
    password: Password.optional(),
    agent: z
      .object({ provider: AgentProvider, description: z.string().max(2000).optional(), supervisorId: Id.nullable().optional() })
      .optional(),
  })
  .strict();
export const UpdateMemberBody = z
  .object({
    role: Role,
    name: ShortText(200),
    email: Email.nullable(),
    phone: Phone.nullable(),
    title: z.string().trim().max(200).nullable(),
    timezone: Tz,
    color: Hex,
    avatarUrl: HttpUrl.nullable(),
    active: z.boolean(),
    prefs: MemberPrefsInput,
    agent: z
      .object({ provider: AgentProvider, description: z.string().max(2000), supervisorId: Id.nullable() })
      .partial()
      .strict(),
  })
  .partial()
  .strict();
export const SetPasswordBody = z.object({ password: Password });

// ─── Keys / org ──────────────────────────────────────────────────────────────

export const KeyListQuery = z.object({ memberId: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), Id.optional()) });
export const CreateKeyBody = z.object({
  memberId: Id,
  name: ShortText(100),
  scopes: z.array(ApiScope).min(1).max(2),
  expiresAt: Epoch.nullable().optional(),
});

export const UpdateOrgBody = z
  .object({
    name: ShortText(200),
    timezone: Tz,
    logo: z.string().max(2048).nullable(),
    workdayStart: z.number().int().min(0).max(23),
    workdayEnd: z.number().int().min(1).max(24),
    defaultReminderOffsets: ReminderOffsets,
    escalateAfterMin: z.number().int().min(1).max(525_600).nullable(),
    agentStaleAfterMin: z.number().int().min(1).max(525_600),
    intakeAutoAck: z.boolean(),
  })
  .partial()
  .strict();

// ─── Meetings ────────────────────────────────────────────────────────────────

export const MeetingListQuery = z.object({
  from: QInt(0, 8.64e15),
  to: QInt(0, 8.64e15),
  memberId: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), z.union([z.literal('me'), Id]).optional()),
});
const MeetingFields = {
  title: ShortText(500),
  startAt: Epoch,
  endAt: Epoch,
  allDay: z.boolean(),
  location: z.string().max(500).nullable(),
  url: HttpUrl.nullable(),
  attendeeIds: z.array(Id).max(200),
  notes: z.string().max(20_000),
};
export const CreateMeetingBody = z
  .object(MeetingFields)
  .partial()
  .required({ title: true, startAt: true, endAt: true })
  .strict()
  .refine((m) => m.endAt >= m.startAt, { message: 'endAt must be >= startAt', path: ['endAt'] });
export const UpdateMeetingBody = z
  .object(MeetingFields)
  .partial()
  .strict()
  .refine((m) => m.startAt === undefined || m.endAt === undefined || m.endAt >= m.startAt, {
    message: 'endAt must be >= startAt',
    path: ['endAt'],
  });
export const CreateFeedBody = z.object({ name: ShortText(200), url: HttpUrl });

// ─── Notifications / push ────────────────────────────────────────────────────

export const NotificationListQuery = z.object({ unread: QBool, limit: QInt(1, 500) });
export const MarkReadBody = z.object({ ids: z.union([z.literal('all'), z.array(Id).max(1000)]) });
export const PushSubscribeBody = z.object({
  endpoint: HttpUrl,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
export const PushUnsubscribeBody = z.object({ endpoint: z.string().min(1).max(2048) });

// ─── Inbox / leads / reports / audit / search ────────────────────────────────

export const InboxListQuery = z.object({ status: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), InboxStatus.optional()) });
export const ConvertInboxBody = TaskDraftInput.partial().strict();

const LeadFields = {
  name: ShortText(200),
  company: z.string().max(200),
  email: z.string().max(254),
  phone: z.string().max(32),
  stage: LeadStage,
  value: z.number().finite().nullable(),
  notes: z.string().max(20_000),
  ownerId: Id.nullable(),
  source: Channel,
};
export const CreateLeadBody = z.object(LeadFields).partial().required({ name: true }).strict();
export const UpdateLeadBody = z.object(LeadFields).partial().strict();

export const ReportQuery = z.object({ days: QInt(1, 365) });
export const AuditListQuery = z.object({
  entity: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), AuditEntity.optional()),
  entityId: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), Id.optional()),
  limit: QInt(1, 500),
});
export const SearchQuery = z.object({
  q: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v), z.string().trim().min(1).max(200)),
  limit: QInt(1, 100),
});

export const TestChannelBody = z.object({ channel: z.enum(['whatsapp', 'email', 'push']) });

// ═════════════════════════════════════════════════════════════════════════════
// Response DTOs — used only to document /api/openapi.json.
// ═════════════════════════════════════════════════════════════════════════════

export const docs = z.registry<{ id: string; description?: string }>();
function dto<T extends z.ZodType>(id: string, schema: T, description?: string): T {
  docs.add(schema, description ? { id, description } : { id });
  return schema;
}
const N = <T extends z.ZodType>(s: T) => s.nullable();
const ts = z.number().int().describe('epoch milliseconds (UTC)');

export const MemberDto = dto(
  'Member',
  z.object({
    id: z.string(),
    orgId: z.string(),
    kind: MemberKind,
    role: Role,
    name: z.string(),
    email: N(z.string()),
    phone: N(z.string()),
    title: N(z.string()),
    initials: z.string(),
    color: z.string(),
    avatarUrl: N(z.string()),
    timezone: z.string(),
    active: z.boolean(),
    prefs: z.object({
      briefingVoice: z.enum(['auto', 'button', 'off']),
      voiceName: N(z.string()).optional(),
      digestHour: N(z.number().int()),
      notifyPush: z.boolean(),
      notifyWhatsapp: z.boolean(),
      notifyEmail: z.boolean(),
      quietStart: N(z.number().int()),
      quietEnd: N(z.number().int()),
      theme: z.enum(['tactical', 'classic']),
      sound: z.boolean(),
    }),
    agent: N(
      z.object({ provider: AgentProvider, description: z.string(), lastSeenAt: N(ts), supervisorId: N(z.string()) }),
    ),
    createdAt: ts,
    updatedAt: ts,
  }),
  'A team member — human or AI agent.',
);

export const OrgDto = dto(
  'OrgSettings',
  z.object({
    id: z.string(),
    name: z.string(),
    timezone: z.string(),
    logo: N(z.string()),
    workdayStart: z.number().int(),
    workdayEnd: z.number().int(),
    defaultReminderOffsets: z.array(z.number().int()),
    escalateAfterMin: N(z.number().int()),
    agentStaleAfterMin: z.number().int(),
    intakeAutoAck: z.boolean(),
    createdAt: ts,
    updatedAt: ts,
  }),
);

const SubtaskDto = dto('Subtask', z.object({ id: z.string(), title: z.string(), done: z.boolean(), doneAt: N(ts), doneBy: N(z.string()) }));
const RecurrenceDto = dto(
  'Recurrence',
  z.object({
    freq: z.enum(['daily', 'weekdays', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int(),
    byWeekday: z.array(z.number().int()).optional(),
    until: N(ts).optional(),
  }),
);
const WaitingOnDto = dto(
  'WaitingOn',
  z.object({
    name: z.string(),
    contact: N(z.string()),
    channel: z.enum(['whatsapp', 'email', 'other']),
    nudgeEveryHours: N(z.number().int()),
    lastNudgedAt: N(ts),
    since: ts,
  }),
);

export const TaskViewDto = dto(
  'Task',
  z.object({
    id: z.string(),
    orgId: z.string(),
    projectId: N(z.string()),
    title: z.string(),
    notes: z.string().describe('Markdown'),
    status: TaskStatus,
    priority: Priority,
    assigneeIds: z.array(z.string()),
    creatorId: z.string(),
    dueAt: N(ts),
    dueAllDay: z.boolean(),
    reminderOffsets: N(z.array(z.number().int())),
    recurrence: N(RecurrenceDto),
    recurrenceParentId: N(z.string()),
    waitingOn: N(WaitingOnDto),
    tags: z.array(z.string()),
    subtasks: z.array(SubtaskDto),
    source: z.object({ channel: Channel, ref: N(z.string()), from: N(z.string()) }),
    order: z.number(),
    startedAt: N(ts),
    completedAt: N(ts),
    completedBy: N(z.string()),
    lastActivityAt: ts,
    createdAt: ts,
    updatedAt: ts,
    isOverdue: z.boolean(),
    isDueToday: z.boolean(),
    isStale: z.boolean(),
    commentCount: z.number().int(),
  }),
  'A task with derived flags.',
);

export const ActivityDto = dto(
  'TaskActivity',
  z.object({
    id: z.string(),
    orgId: z.string(),
    taskId: z.string(),
    actorId: z.string(),
    kind: z.string(),
    text: z.string(),
    data: N(z.record(z.string(), z.unknown())),
    at: ts,
  }),
);

const ProjectFieldsDto = {
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  emoji: z.string(),
  color: z.string(),
  description: z.string(),
  status: ProjectStatus,
  leadId: N(z.string()),
  memberIds: z.array(z.string()),
  dueAt: N(ts),
  createdBy: z.string(),
  createdAt: ts,
  updatedAt: ts,
};
export const ProjectDto = dto('Project', z.object(ProjectFieldsDto));
export const ProjectSummaryDto = dto(
  'ProjectSummary',
  z.object({
    ...ProjectFieldsDto,
    counts: z.object({ total: z.number().int(), open: z.number().int(), done: z.number().int(), overdue: z.number().int(), dueThisWeek: z.number().int() }),
    progress: z.number().min(0).max(1),
  }),
);

export const ApiKeyDto = dto(
  'ApiKey',
  z.object({
    id: z.string(),
    orgId: z.string(),
    memberId: z.string(),
    name: z.string(),
    prefix: z.string(),
    scopes: z.array(ApiScope),
    createdBy: z.string(),
    createdAt: ts,
    lastUsedAt: N(ts),
    expiresAt: N(ts),
    revokedAt: N(ts),
  }),
);

export const MeetingDto = dto(
  'Meeting',
  z.object({
    id: z.string(),
    orgId: z.string(),
    ownerId: N(z.string()),
    title: z.string(),
    startAt: ts,
    endAt: ts,
    allDay: z.boolean(),
    location: N(z.string()),
    url: N(z.string()),
    attendeeIds: z.array(z.string()),
    notes: z.string(),
    source: z.enum(['manual', 'ics']),
    externalId: N(z.string()),
    feedId: N(z.string()),
    createdAt: ts,
    updatedAt: ts,
  }),
);

export const CalendarFeedDto = dto(
  'CalendarFeed',
  z.object({
    id: z.string(),
    orgId: z.string(),
    memberId: z.string(),
    name: z.string(),
    urlMasked: z.string(),
    lastSyncAt: N(ts),
    lastError: N(z.string()),
    createdAt: ts,
  }),
);

export const NotificationDto = dto(
  'Notification',
  z.object({
    id: z.string(),
    orgId: z.string(),
    memberId: z.string(),
    kind: z.string(),
    title: z.string(),
    body: z.string(),
    taskId: N(z.string()),
    meetingId: N(z.string()),
    link: N(z.string()),
    urgent: z.boolean(),
    readAt: N(ts),
    createdAt: ts,
  }),
);

export const TaskDraftDto = dto(
  'TaskDraft',
  z.object({
    title: z.string(),
    notes: z.string().optional(),
    dueAt: N(ts).optional(),
    dueAllDay: z.boolean().optional(),
    priority: Priority.optional(),
    assigneeIds: z.array(z.string()).optional(),
    projectId: N(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    recurrence: N(RecurrenceDto).optional(),
    reminderOffsets: N(z.array(z.number().int())).optional(),
  }),
);

export const InboxItemDto = dto(
  'InboxItem',
  z.object({
    id: z.string(),
    orgId: z.string(),
    channel: z.enum(['whatsapp', 'email']),
    from: z.string(),
    fromName: N(z.string()),
    subject: N(z.string()),
    text: z.string(),
    externalId: z.string(),
    memberId: N(z.string()),
    status: InboxStatus,
    suggestion: N(TaskDraftDto),
    taskId: N(z.string()),
    receivedAt: ts,
    createdAt: ts,
  }),
);

export const LeadDto = dto(
  'Lead',
  z.object({
    id: z.string(),
    orgId: z.string(),
    name: z.string(),
    company: z.string(),
    email: z.string(),
    phone: z.string(),
    stage: LeadStage,
    value: N(z.number()),
    notes: z.string(),
    ownerId: N(z.string()),
    source: Channel,
    createdBy: z.string(),
    createdAt: ts,
    updatedAt: ts,
  }),
);

export const AuditEventDto = dto(
  'AuditEvent',
  z.object({
    id: z.string(),
    orgId: z.string(),
    actorId: z.string(),
    type: z.string(),
    entity: AuditEntity,
    entityId: z.string(),
    summary: z.string(),
    before: N(z.record(z.string(), z.unknown())),
    after: N(z.record(z.string(), z.unknown())),
    undoable: z.boolean(),
    undoneAt: N(ts),
    undoneBy: N(z.string()),
    at: ts,
  }),
);

export const ReportDto = dto(
  'Report',
  z.object({
    windowDays: z.number().int(),
    generatedAt: ts,
    totals: z.object({ created: z.number(), completed: z.number(), overdueNow: z.number(), onTimeRate: z.number(), avgCycleHours: z.number() }),
    daily: z.array(z.object({ date: z.string(), created: z.number(), completed: z.number() })),
    byMember: z.array(z.object({ memberId: z.string(), completed: z.number(), overdue: z.number(), onTimeRate: z.number() })),
    byProject: z.array(z.object({ projectId: N(z.string()), open: z.number(), completed: z.number() })),
    humansVsAgents: z.object({ humans: z.number(), agents: z.number() }),
  }),
);

export const BriefingDto = dto(
  'Briefing',
  z.object({
    memberId: z.string(),
    generatedAt: ts,
    greeting: z.string(),
    spoken: z.string().describe('Script to read aloud'),
    headline: z.string(),
    myTasks: z.object({ overdue: z.array(TaskViewDto), today: z.array(TaskViewDto), upcoming: z.array(TaskViewDto) }),
    meetings: z.array(MeetingDto),
    waitingOn: z.array(TaskViewDto),
    team: z.array(
      z.object({
        member: MemberDto,
        open: z.number(),
        overdue: z.number(),
        dueToday: z.number(),
        doneToday: z.number(),
        doneThisWeek: z.number(),
        inProgress: z.array(TaskViewDto),
      }),
    ),
    agents: z.array(z.object({ member: MemberDto, inProgress: z.array(TaskViewDto), stale: z.array(TaskViewDto) })),
    unreadNotifications: z.number().int(),
    inboxNew: z.number().int(),
  }),
);

export const ParsedQuickAddDto = dto(
  'ParsedQuickAdd',
  z.object({
    title: z.string(),
    dueAt: N(ts),
    dueAllDay: z.boolean(),
    priority: N(Priority),
    assigneeHints: z.array(z.string()),
    projectHint: N(z.string()),
    tags: z.array(z.string()),
    recurrence: N(RecurrenceDto),
    reminderOffsets: N(z.array(z.number().int())),
    tokens: z.array(z.object({ start: z.number().int(), end: z.number().int(), kind: z.string() })),
  }),
);

export const IntegrationsDto = dto(
  'Integrations',
  z.object({
    whatsapp: z.object({ mode: N(z.enum(['cloud', 'qr'])), connected: z.boolean(), phone: N(z.string()) }),
    email: z.object({ inbound: z.boolean(), outbound: z.boolean(), address: N(z.string()) }),
    push: z.boolean(),
    llm: z.object({ provider: N(z.string()) }),
    tts: z.object({ provider: N(z.string()) }),
    mcpUrl: z.string(),
  }),
);

export const QrStatusDto = dto(
  'WhatsAppQrStatus',
  z.object({ status: z.enum(['disconnected', 'pairing', 'connected']), qr: N(z.string()).describe('data: URL'), phone: N(z.string()).optional() }),
);

export const OkDto = dto('Ok', z.object({ ok: z.boolean() }));

export const ErrorDto = dto(
  'Error',
  z.object({
    error: z.object({
      code: z.enum(['bad_request', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'rate_limited', 'internal']),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
);

// ─── Game (Tactical Ops) ─────────────────────────────────────────────────────

export const GameMemberQuery = z.object({
  memberId: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), Id.optional()),
});
export const LeaderboardQuery = z.object({
  period: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v || undefined), z.enum(['week', 'month', 'all']).default('week')),
});
export const LimitQuery = z.object({ limit: QInt(1, 200) });
const Cosmetic = z.string().trim().min(1).max(100).nullable();
export const EquipBody = z.object({ title: Cosmetic.optional(), frame: Cosmetic.optional(), emote: Cosmetic.optional() }).strict();

const Rarity = z.enum(['common', 'rare', 'epic', 'legendary']);
const RankDto = dto(
  'Rank',
  z.object({
    id: z.string(),
    name: z.string(),
    minLevel: z.number().int(),
    insignia: z.object({ kind: z.enum(['chevron', 'bar', 'star', 'crown']), count: z.number().int(), color: z.string() }),
  }),
);
const MissionProgressDto = dto(
  'MissionProgress',
  z.object({ total: z.number().int(), done: z.number().int(), pending: z.number().int(), overdue: z.number().int(), pct: z.number() }),
);
export const PlayerProfileDto = dto(
  'PlayerProfile',
  z.object({
    memberId: z.string(),
    xp: z.number().int(),
    level: z.number().int(),
    levelXp: z.number().int(),
    levelProgressXp: z.number().int(),
    rank: RankDto,
    nextRank: N(RankDto),
    coins: z.number().int(),
    streak: z.object({ current: z.number().int(), best: z.number().int(), lastActiveDay: N(z.string()) }),
    stats: z.object({
      missionsCompleted: z.number().int(),
      onTime: z.number().int(),
      rescued: z.number().int(),
      created: z.number().int(),
      cratesOpened: z.number().int(),
      achievements: z.number().int(),
    }),
    equipped: z.object({ title: N(z.string()), frame: N(z.string()), emote: N(z.string()) }),
    unopenedCrates: z.number().int(),
  }),
);
export const DailyChallengeDto = dto(
  'DailyChallenge',
  z.object({
    id: z.string(),
    memberId: z.string(),
    day: z.string(),
    title: z.string(),
    description: z.string(),
    target: z.number().int(),
    progress: z.number().int(),
    xp: z.number().int(),
    completedAt: N(ts),
  }),
);
export const HudDto = dto(
  'Hud',
  z.object({
    profile: PlayerProfileDto,
    today: MissionProgressDto,
    week: MissionProgressDto,
    operations: z.array(z.object({ projectId: z.string(), name: z.string(), emoji: z.string(), color: z.string(), progress: MissionProgressDto })),
    squadToday: MissionProgressDto,
    challenges: z.array(DailyChallengeDto),
    boost: N(z.object({ multiplier: z.number(), until: ts })),
  }),
);
const LeaderboardEntryDto = z.object({
  member: MemberDto,
  position: z.number().int(),
  xp: z.number().int(),
  missions: z.number().int(),
  onTimeRate: z.number(),
  rank: RankDto,
  level: z.number().int(),
  streak: z.number().int(),
});
export const LeaderboardDto = dto(
  'Leaderboard',
  z.object({ period: z.enum(['week', 'month', 'all']), humans: z.array(LeaderboardEntryDto), agents: z.array(LeaderboardEntryDto) }),
);
export const AchievementProgressDto = dto(
  'AchievementProgress',
  z.object({
    achievement: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      icon: z.string(),
      tier: z.enum(['bronze', 'silver', 'gold', 'legendary']),
      secret: z.boolean(),
      target: z.number().int(),
    }),
    progress: z.number(),
    unlockedAt: N(ts),
  }),
);
export const CrateDto = dto(
  'Crate',
  z.object({
    id: z.string(),
    memberId: z.string(),
    rarity: Rarity,
    source: z.string(),
    earnedAt: ts,
    openedAt: N(ts),
    reward: N(
      z.object({
        kind: z.enum(['coins', 'xp_boost', 'title', 'frame', 'emote']),
        id: z.string(),
        name: z.string(),
        rarity: Rarity,
        amount: z.number().optional(),
      }),
    ),
  }),
);
export const InventoryItemDto = dto(
  'InventoryItem',
  z.object({ kind: z.enum(['title', 'frame', 'emote']), id: z.string(), name: z.string(), rarity: Rarity, acquiredAt: ts }),
);
export const FeedItemDto = dto(
  'FeedItem',
  z.object({ id: z.string(), memberId: z.string(), text: z.string(), kind: z.string(), xp: z.number().int(), at: ts }),
);
export const RewardEventDto = dto(
  'RewardEvent',
  z.object({
    id: z.string(),
    orgId: z.string(),
    memberId: z.string(),
    kind: z.string(),
    xp: z.number().int(),
    coins: z.number().int(),
    label: z.string(),
    taskId: N(z.string()),
    level: z.number().int().optional(),
    rank: RankDto.optional(),
    crateId: z.string().optional(),
    rarity: Rarity.optional(),
    achievementId: z.string().optional(),
    at: ts,
  }),
);

// ─── OAuth consent (session-authenticated part) ──────────────────────────────

export const OAuthClientQuery = z.object({
  client_id: z.preprocess((v) => (Array.isArray(v) ? v[v.length - 1] : v), z.string().min(1).max(4096)),
  redirect_uri: QStr(2048),
});
export const OAuthApproveBody = z.object({
  query: z.record(z.string(), z.string().max(4096)),
  scopes: z.array(ApiScope).min(1).max(2).default(['read', 'write']),
  actAs: Id,
  approve: z.boolean(),
});
export const OAuthClientDto = dto(
  'OAuthClient',
  z.object({ name: z.string(), host: z.string(), redirectUri: z.string(), redirectUris: z.array(z.string()) }),
);
