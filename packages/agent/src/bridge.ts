// The bridge — voice → intent → (maybe confirm) → execute → log → (maybe core task).
// handleCommand() is the single entry point a voice/CLI surface calls with a natural
// language string. It owns the full lifecycle and reports back exactly what happened
// (intent, result, whether confirmation was needed/granted, and any core task created),
// so the caller can narrate it ("Done — created your task" / "I need your OK to run that").

import type { Core } from '@companybrain/core';
import { classifyIntent, type ClassifiedIntent, type Llm } from './intent.js';
import { classifyCommand, formatConfirmPrompt, type CommandRisk } from './safety.js';
import {
  executeShell,
  openUrl,
  openApp,
  createFolder,
  writeFile,
  readFile,
  type ActionResult,
} from './executor.js';

export interface BridgeDeps {
  core: Core;
  llm?: Llm;
  /** Called when an action needs a human yes/no. Default: always allow (autonomous). */
  onConfirm?: (intent: ClassifiedIntent, risk: CommandRisk) => Promise<boolean>;
  /** Append a structured log entry for every command, success or failure. */
  onLog?: (entry: BridgeLogEntry) => void;
}

export interface BridgeLogEntry {
  command: string;
  intent: ClassifiedIntent;
  result?: ActionResult;
  risk?: CommandRisk;
  requiredConfirm: boolean;
  confirmed?: boolean;
  task?: unknown;
  at: number;
}

export interface HandleResult {
  intent: ClassifiedIntent;
  result?: ActionResult;
  task?: unknown;
  requiredConfirm: boolean;
  confirmed?: boolean;
}

/** The intent types that perform an OS action and therefore need a risk check. */
const OS_INTENTS = new Set<ClassifiedIntent['type']>([
  'shell_command',
  'write_file',
  'create_folder',
]);

/**
 * Run a command end-to-end. Always returns a HandleResult (never throws) and always
 * emits one onLog entry capturing the full trail.
 */
export async function handleCommand(command: string, deps: BridgeDeps): Promise<HandleResult> {
  const intent = await classifyIntent(command, deps.llm);
  const at = Date.now();

  // Non-OS intents that don't need a risk pass.
  if (intent.type === 'create_task') {
    const task = await createTaskInCore(intent, deps);
    const result: HandleResult = { intent, task, requiredConfirm: false };
    await log(deps, { command, intent, task, requiredConfirm: false, at });
    return result;
  }

  if (intent.type === 'unknown') {
    const result: HandleResult = {
      intent,
      result: { ok: false, output: '', error: "I couldn't tell what you wanted me to do.", durationMs: 0 },
      requiredConfirm: false,
    };
    await log(deps, { command, intent, result: result.result, requiredConfirm: false, at });
    return result;
  }

  // OS / open / read intents: resolve the concrete action, check risk, maybe confirm.
  const plan = resolveAction(intent);
  const risk = plan.risk ?? classifyCommand(plan.shellPreview);
  const requiresConfirm = risk.requiresConfirm;

  let confirmed: boolean | undefined;
  if (requiresConfirm) {
    confirmed = await askConfirm(deps, intent, risk);
    if (!confirmed) {
      const result: HandleResult = {
        intent,
        result: { ok: false, output: '', error: 'Cancelled — command was not confirmed.', durationMs: 0 },
        requiredConfirm: true,
        confirmed: false,
      };
      await log(deps, { command, intent, risk, result: result.result, requiredConfirm: true, confirmed: false, at });
      return result;
    }
  }

  const actionResult = plan.run ? await plan.run() : undefined;
  await log(deps, { command, intent, risk, result: actionResult, requiredConfirm: requiresConfirm, confirmed, at });

  return { intent, result: actionResult, requiredConfirm: requiresConfirm, confirmed };
}

/** A resolved plan: the runnable thunk + a shell string for risk classification. */
interface ActionPlan {
  run?: () => Promise<ActionResult>;
  shellPreview: string;
  risk?: CommandRisk; // precomputed for non-shell actions
}

function resolveAction(intent: ClassifiedIntent): ActionPlan {
  switch (intent.type) {
    case 'shell_command': {
      const command = String(intent.args.command ?? '');
      return { run: () => executeShell(command), shellPreview: command };
    }
    case 'open_url': {
      const url = String(intent.args.url ?? '');
      return { run: () => openUrl(url), shellPreview: url, risk: safeRisk('Opening a URL.') };
    }
    case 'open_app': {
      const appName = String(intent.args.appName ?? '');
      return { run: () => openApp(appName), shellPreview: appName, risk: safeRisk('Opening an application.') };
    }
    case 'create_folder': {
      const path = String(intent.args.path ?? '');
      // mkdir -p is idempotent; treat as safe.
      return { run: () => createFolder(path), shellPreview: `mkdir -p ${path}`, risk: safeRisk('Creating a folder.') };
    }
    case 'write_file': {
      const path = String(intent.args.path ?? '');
      // Overwriting existing files is caution-worthy; classify at run time via shellPreview.
      return { run: () => writeFile(path, String(intent.args.content ?? '')), shellPreview: `write ${path}` };
    }
    case 'read_file': {
      const path = String(intent.args.path ?? '');
      return { run: () => readFile(path), shellPreview: `read ${path}`, risk: safeRisk('Reading a file.') };
    }
    case 'search_youtube': {
      const query = String(intent.args.query ?? '');
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return { run: () => openUrl(url), shellPreview: url, risk: safeRisk('Opening a YouTube search.') };
    }
    case 'send_message': {
      // Messaging is surfaced to the caller via the log/intent; no direct OS action here.
      return {
        run: async () => ({
          ok: false,
          output: '',
          error: 'send_message is not wired to a channel in this build.',
          durationMs: 0,
        }),
        shellPreview: '',
        risk: safeRisk('Send-message intent captured (no channel bound).'),
      };
    }
    default:
      return { shellPreview: '' };
  }
}

function safeRisk(reason: string): CommandRisk {
  return { level: 'safe', reason, requiresConfirm: false };
}

async function createTaskInCore(intent: ClassifiedIntent, deps: BridgeDeps): Promise<unknown> {
  try {
    const principal = await deps.core.ctx.auth.current();
    return deps.core.tasks.create({
      orgId: principal.orgId,
      actorId: principal.userId,
      title: String(intent.args.title ?? 'Untitled task'),
      day: intent.args.day,
      priority: intent.args.priority ?? null,
    });
  } catch (err) {
    // Surface the failure as a non-fatal result — the bridge never throws.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function askConfirm(deps: BridgeDeps, intent: ClassifiedIntent, risk: CommandRisk): Promise<boolean> {
  if (deps.onConfirm) {
    try {
      return await deps.onConfirm(intent, risk);
    } catch {
      return false;
    }
  }
  // No confirm hook → autonomous mode. Still surface the prompt for logging/debugging.
  formatConfirmPrompt(intent.rawCommand, risk);
  return true;
}

async function log(deps: BridgeDeps, entry: BridgeLogEntry): Promise<void> {
  if (!deps.onLog) return;
  try {
    deps.onLog(entry);
  } catch {
    /* logging must never break execution */
  }
}
