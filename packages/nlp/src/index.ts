// @companybrain/nlp — natural-language quick-add parser.
// STUB with the final signature. The NLP workstream replaces the body; callers must only
// rely on the exported signature below. Pure: no I/O, runs in Node and the browser.

import type { ParsedQuickAdd } from '@companybrain/types';

export interface ParseOptions {
  /** Reference time (epoch ms). */
  now: number;
  /** IANA timezone used to interpret "tomorrow 5pm" etc. */
  timezone: string;
  /** Hour (0-23, local) used for "tomorrow" without a time when a time is needed; default 18. */
  defaultHour?: number;
}

export function parseQuickAdd(text: string, _opts: ParseOptions): ParsedQuickAdd {
  return {
    title: text.trim(),
    dueAt: null,
    dueAllDay: false,
    priority: null,
    assigneeHints: [],
    projectHint: null,
    tags: [],
    recurrence: null,
    reminderOffsets: null,
    tokens: [],
  };
}
