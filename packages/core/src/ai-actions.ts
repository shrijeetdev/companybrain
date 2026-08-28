// Action adapters — one LLM call produces text; the action does something with it.
// generate stores the text as a task comment; publish_blog pushes a draft to WordPress.
// Each action declares its default autonomy floor — the executor takes the stricter of
// (global executeAi gate, action.defaultAutonomy).
//
// DEPENDENCY RULE: this file imports NOTHING from @companybrain/integrations. The
// concrete publishBlog client is injected via ActionDeps (the same port-injection pattern
// core uses for Messenger/Drafter) — otherwise core→integrations→core would be a cycle.
//
// SECURITY: the LLM's output is DATA, never instructions. No action parses the output for
// commands — each one puts the text somewhere fixed by code.

import type { AiActionType, Task, Autonomy } from '@companybrain/types';
import { type Context, newId, now } from './context';

export interface WordpressCreds {
  apiUrl: string;
  username: string;
  appPassword: string;
}

/** Injected WordPress publisher — the integrations package supplies the real one at boot. */
export type PublishBlogFn = (opts: {
  creds: WordpressCreds;
  title: string;
  content: string;
}) => Promise<{ ok: boolean; postUrl?: string; error?: string }>;

export interface ActionDeps {
  wordpressCreds?: WordpressCreds;
  publishBlog?: PublishBlogFn;
}

export interface ActionRunInput {
  task: Task;
  output: string;
  ctx: Context;
  deps: ActionDeps;
}

export interface ActionRunResult {
  ok: boolean;
  resultRef?: string;
  error?: string;
}

export interface Action {
  type: AiActionType;
  defaultAutonomy: Autonomy;
  prompt(task: Task): { system: string; user: string };
  run(input: ActionRunInput): Promise<ActionRunResult>;
}

/** A per-task promptOverride replaces the user message; the system prompt is fixed by the action. */
const userPrompt = (task: Task, fallback: string): string => task.aiConfig?.promptOverride?.trim() || fallback;

const generate: Action = {
  type: 'generate',
  defaultAutonomy: 'auto',
  prompt(task) {
    return {
      system: 'You produce the deliverable described by the task title. Plain text unless the task asks for markup. No preamble, no "here is", just the content.',
      user: userPrompt(task, `Task: ${task.title}`),
    };
  },
  async run({ task, output, ctx }) {
    const comment = { id: newId('cmt'), text: output, by: 'agent_executor', at: now() };
    const comments = [...(task.comments ?? []), comment];
    await ctx.db.tasks.update(task.id, { comments });
    return { ok: true, resultRef: comment.id };
  },
};

const publish_blog: Action = {
  type: 'publish_blog',
  defaultAutonomy: 'ask',
  prompt(task) {
    return {
      system: 'You write a complete, ready-to-publish blog post as HTML (article element with headings and paragraphs). No markdown fences, no commentary outside the HTML. Match the topic of the task title.',
      user: userPrompt(task, `Write a blog post about: ${task.title}`),
    };
  },
  async run({ task, output, deps }) {
    if (!deps.wordpressCreds) {
      return { ok: false, error: 'WordPress is not configured. Add credentials in Settings → AI.' };
    }
    if (!deps.publishBlog) {
      return { ok: false, error: 'publishBlog client not injected (misconfiguration).' };
    }
    const result = await deps.publishBlog({ creds: deps.wordpressCreds, title: task.title, content: output });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, resultRef: result.postUrl };
  },
};

export const ACTIONS: Record<AiActionType, Action> = {
  generate,
  publish_blog,
};
