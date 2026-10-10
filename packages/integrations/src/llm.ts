// Optional LLM (Anthropic Messages API preferred, or any OpenAI-compatible /chat/completions
// endpoint such as OpenAI or OpenRouter). Raw fetch, no SDKs. Every failure degrades:
// extractTask → null (core falls back to the NL parser), polishBriefing → original script.

import type { Llm, Priority, TaskDraft } from '@companybrain/types';
import type { IntegrationsConfig, LlmConfig } from './config';
import { wallToUtc } from './calendar/tz';
import { defaultLogger, errMsg, fetchWithTimeout, safeText, type FetchLike, type Logger } from './util';

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];
const ALL_DAY_HOUR = 18; // "due that day" = end of workday, member tz (matches nlp defaultHour)

export interface ExtractInput {
  text: string;
  subject?: string | null;
  from?: string | null;
  now: number;
  timezone: string;
  members: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

/** JSON schema the model must follow (also sent as structured-output format when supported). */
export const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isTask: { type: 'boolean' },
    title: { type: 'string' },
    notes: { type: 'string' },
    due: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    priority: { type: 'string', enum: PRIORITIES },
    assigneeIds: { type: 'array', items: { type: 'string' } },
    projectId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['isTask', 'title', 'notes', 'due', 'priority', 'assigneeIds', 'projectId', 'tags'],
} as const;

export const EXTRACT_SYSTEM = `You turn an inbound WhatsApp or email message into a task for a team task manager.
Reply with ONLY a JSON object (no prose, no code fences) with exactly these keys:
{"isTask": boolean, "title": string, "notes": string, "due": string|null, "priority": "urgent"|"high"|"medium"|"low"|"none", "assigneeIds": string[], "projectId": string|null, "tags": string[]}
Rules:
- isTask=false (other fields empty/null) for greetings, thanks, spam, newsletters, automated notices, or anything with no actionable request.
- title: short imperative summary (max 100 chars) in the sender's language, e.g. "Send Acme proposal". No dates or names of assignees in the title unless essential.
- notes: useful extra details from the message (may be empty). Never invent facts.
- due: the deadline as LOCAL time in the given time zone, "YYYY-MM-DDTHH:mm" when a time is stated or clearly implied, or "YYYY-MM-DD" for a day with no time. Resolve relative dates ("tomorrow", "next Friday", "EOD", "in 2 hours") against the provided current local date/time. null when there is no deadline.
- priority: "urgent" only for explicit urgency (ASAP, urgent, today critical), "high" for important/soon, otherwise "none" unless stated.
- assigneeIds: ids from the provided members list ONLY when the message clearly names that person (fuzzy name match ok). Otherwise [].
- projectId: an id from the provided projects list only if the message clearly refers to it, else null.
- tags: up to 5 short lowercase keywords explicitly mentioned as tags/hashtags; usually [].`;

export const POLISH_SYSTEM = `You rewrite a daily briefing so it sounds natural when read aloud by a voice assistant.
Rules: keep EVERY fact (counts, names, task titles, times, people) — add nothing, drop nothing. Keep all numbers and times written as digits.
At most 120 words. Warm, friendly, concise, natural spoken English; address the person by first name once.
Plain text only: no markdown, no bullet points, no emoji, no headings. Output only the rewritten briefing.`;

function localNowString(now: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(now));
  } catch {
    return new Date(now).toISOString();
  }
}

export function buildExtractPrompt(input: ExtractInput): string {
  const tz = safeTz(input.timezone);
  return JSON.stringify(
    {
      currentLocalDateTime: localNowString(input.now, tz),
      currentDateISO: localDateISO(input.now, tz),
      timeZone: tz,
      members: input.members.slice(0, 200).map((m) => ({ id: m.id, name: m.name })),
      projects: input.projects.slice(0, 200).map((p) => ({ id: p.id, name: p.name })),
      message: {
        from: input.from ?? null,
        subject: input.subject ?? null,
        text: input.text.slice(0, 8000),
      },
    },
    null,
    1,
  );
}

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function localDateISO(now: number, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return p; // en-CA → YYYY-MM-DD
}

/** Pull the first JSON object out of a model reply (tolerates code fences and stray prose). */
export function extractJsonObject(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Validate the model's JSON into a TaskDraft. null = not a task or invalid. */
export function validateExtraction(raw: unknown, ctx: Pick<ExtractInput, 'now' | 'timezone' | 'members' | 'projects'>): TaskDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.isTask !== true) return null;
  const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!title) return null;
  const draft: TaskDraft = { title };

  if (typeof r.notes === 'string' && r.notes.trim()) draft.notes = r.notes.trim().slice(0, 5000);

  if (typeof r.due === 'string' && r.due.trim()) {
    const due = resolveLocalDue(r.due.trim(), safeTz(ctx.timezone));
    // Sanity: not more than a year in the past or 5 years ahead.
    if (due && due.at > ctx.now - 365 * 86_400_000 && due.at < ctx.now + 5 * 365 * 86_400_000) {
      draft.dueAt = due.at;
      draft.dueAllDay = due.allDay;
    }
  }

  if (typeof r.priority === 'string' && (PRIORITIES as string[]).includes(r.priority)) draft.priority = r.priority as Priority;

  const memberIds = new Set(ctx.members.map((m) => m.id));
  if (Array.isArray(r.assigneeIds)) {
    const ids = [...new Set(r.assigneeIds.filter((x): x is string => typeof x === 'string' && memberIds.has(x)))];
    if (ids.length) draft.assigneeIds = ids;
  }
  if (typeof r.projectId === 'string' && ctx.projects.some((p) => p.id === r.projectId)) draft.projectId = r.projectId;

  if (Array.isArray(r.tags)) {
    const tags = [
      ...new Set(
        r.tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32))
          .filter(Boolean),
      ),
    ].slice(0, 5);
    if (tags.length) draft.tags = tags;
  }
  return draft;
}

/** "YYYY-MM-DD" (all-day → 18:00 local) or "YYYY-MM-DDTHH:mm[:ss]" local; explicit offsets/Z honoured. */
export function resolveLocalDue(v: string, tz: string): { at: number; allDay: boolean } | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (d) {
    const w = { y: +d[1]!, m: +d[2]!, d: +d[3]!, h: ALL_DAY_HOUR, mi: 0, s: 0 };
    if (w.m < 1 || w.m > 12 || w.d < 1 || w.d > 31) return null;
    return { at: wallToUtc(w, tz), allDay: true };
  }
  const t = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v);
  if (!t) return null;
  if (t[7]) {
    const ms = Date.parse(v.replace(' ', 'T'));
    return Number.isFinite(ms) ? { at: ms, allDay: false } : null;
  }
  const w = { y: +t[1]!, m: +t[2]!, d: +t[3]!, h: +t[4]!, mi: +t[5]!, s: t[6] ? +t[6] : 0 };
  if (w.m < 1 || w.m > 12 || w.d < 1 || w.d > 31 || w.h > 23 || w.mi > 59) return null;
  return { at: wallToUtc(w, tz), allDay: false };
}

/** Plain-text cleanup for spoken output. */
export function cleanSpoken(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+\.\s+)/gm, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** true when every number in `original` still appears in `rewritten` (a cheap "facts kept" check). */
export function numbersPreserved(original: string, rewritten: string): boolean {
  const nums = (s: string) => s.match(/\d+/g) ?? [];
  const have = new Set(nums(rewritten));
  return nums(original).every((n) => have.has(n));
}

/** Models that accept output_config (effort + structured outputs). */
export function supportsOutputConfig(model: string): boolean {
  const m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/.exec(model);
  if (!m) return false;
  const major = Number(m[2]);
  const minor = Number(m[3] ?? 0);
  if (major >= 5) return true;
  return m[1] === 'opus' && major === 4 && minor >= 7 && minor < 10;
}

export interface LlmDeps {
  fetch?: FetchLike;
  log?: Logger;
}

type Ask = (system: string, user: string, opts: { timeoutMs: number; maxTokens: number; json?: boolean }) => Promise<string | null>;

function anthropicAsk(cfg: Extract<LlmConfig, { provider: 'anthropic' }>, f: FetchLike, log: Logger): Ask {
  return async (system, user, { timeoutMs, maxTokens, json }) => {
    const modern = supportsOutputConfig(cfg.model);
    const body: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    };
    if (modern) body.output_config = { effort: 'low', ...(json ? { format: { type: 'json_schema', schema: EXTRACT_SCHEMA } } : {}) };
    const res = await fetchWithTimeout(
      f,
      `${cfg.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    if (!res.ok) {
      log.warn(`llm: anthropic HTTP ${res.status} ${await safeText(res)}`);
      return null;
    }
    const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
    if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') return null;
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    return text || null;
  };
}

function openaiAsk(cfg: Extract<LlmConfig, { provider: 'openai' }>, f: FetchLike, log: Logger): Ask {
  return async (system, user, { timeoutMs, json }) => {
    const isOpenAi = /^https:\/\/api\.openai\.com\//.test(`${cfg.baseUrl}/`);
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(json && isOpenAi ? { response_format: { type: 'json_object' } } : {}),
    };
    const res = await fetchWithTimeout(
      f,
      `${cfg.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    if (!res.ok) {
      log.warn(`llm: openai-compatible HTTP ${res.status} ${await safeText(res)}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: string }[] };
    const choice = data.choices?.[0];
    if (!choice || choice.message?.refusal || choice.finish_reason === 'length') return null;
    const content = choice.message?.content;
    return typeof content === 'string' && content ? content : null;
  };
}

export function createLlm(cfg: IntegrationsConfig, deps: LlmDeps = {}): Llm | null {
  const llm = cfg.llm;
  if (!llm) return null;
  const log = deps.log ?? defaultLogger;
  const f = deps.fetch ?? fetch;
  const ask: Ask = llm.provider === 'anthropic' ? anthropicAsk(llm, f, log) : openaiAsk(llm, f, log);

  return {
    async extractTask(input) {
      try {
        if (!input?.text?.trim() && !input?.subject?.trim()) return null;
        const reply = await ask(EXTRACT_SYSTEM, buildExtractPrompt(input), { timeoutMs: 10_000, maxTokens: 2048, json: true });
        if (!reply) return null;
        return validateExtraction(extractJsonObject(reply), input);
      } catch (e) {
        log.warn('llm: extractTask failed:', errMsg(e));
        return null;
      }
    },
    async polishBriefing(input) {
      const original = input?.script ?? '';
      try {
        if (!original.trim()) return original;
        const user = `Person's name: ${input.name}\nTime zone: ${input.timezone}\n\nBriefing to rewrite:\n${original}`;
        const reply = await ask(POLISH_SYSTEM, user, { timeoutMs: 4_000, maxTokens: 1024 });
        if (!reply) return original;
        const out = cleanSpoken(reply);
        const words = out.split(/\s+/).filter(Boolean).length;
        const origWords = original.split(/\s+/).filter(Boolean).length;
        if (!out || words > Math.max(150, origWords * 1.3) || !numbersPreserved(original, out)) return original;
        return out;
      } catch (e) {
        log.warn('llm: polishBriefing failed:', errMsg(e));
        return original;
      }
    },
  };
}
