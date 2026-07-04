// OS action executor — the JARVIS hands. Every function returns an ActionResult and
// NEVER throws: a failed spawn is reported as ok:false rather than rejecting, so the
// bridge/voice layer can narrate the failure instead of crashing. All child processes
// are killed after a 30s ceiling so a hung command can't wedge the agent.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { platform } from 'node:os';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30_000;
const IS_MAC = platform() === 'darwin';
const IS_WIN = platform() === 'win32';

export interface ActionResult {
  ok: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface ShellOptions {
  cwd?: string;
  timeoutMs?: number;
}

function elapsed(start: number): number {
  return Date.now() - start;
}

/** Run a shell command string, capturing combined stdout+stderr. Times out at 30s. */
export async function executeShell(command: string, opts: ShellOptions = {}): Promise<ActionResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: opts.cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 8, // 8MB — enough for most command output
      killSignal: 'SIGTERM',
    });
    const output = (stdout + (stderr ? `\n${stderr}` : '')).trimEnd();
    return { ok: true, output, error: stderr ? stderr.trim() || undefined : undefined, durationMs: elapsed(start) };
  } catch (err: any) {
    const stdout = (err?.stdout ?? '').toString();
    const stderr = (err?.stderr ?? err?.message ?? String(err)).toString();
    const timedOut = err?.killed === true || err?.signal === 'SIGTERM';
    return {
      ok: false,
      output: stdout.trim(),
      error: (timedOut ? `Command timed out after ${timeoutMs}ms. ` : '') + stderr.trim(),
      durationMs: elapsed(start),
    };
  }
}

/** Run an AppleScript (macOS only). No-op failure on other platforms. */
export async function executeAppleScript(script: string): Promise<ActionResult> {
  if (!IS_MAC) {
    return {
      ok: false,
      output: '',
      error: 'AppleScript is only available on macOS.',
      durationMs: 0,
    };
  }
  return executeShell(`osascript -e ${quoteForShell(script)}`);
}

/** Open a URL in the user's default browser. */
export async function openUrl(url: string): Promise<ActionResult> {
  const cmd = IS_MAC ? `open ${quoteForShell(url)}` : IS_WIN ? `start ${quoteForShell(url)}` : `xdg-open ${quoteForShell(url)}`;
  return executeShell(cmd);
}

/** Open an application by name. */
export async function openApp(appName: string): Promise<ActionResult> {
  const cmd = IS_MAC
    ? `open -a ${quoteForShell(appName)}`
    : IS_WIN
      ? `start ${quoteForShell(appName)}`
      : `xdg-open ${quoteForShell(appName)}`;
  return executeShell(cmd);
}

/** Create a directory (and parents). Idempotent — succeeds if it already exists. */
export async function createFolder(path: string): Promise<ActionResult> {
  const start = Date.now();
  try {
    await mkdir(path, { recursive: true });
    return { ok: true, output: `Created folder: ${path}`, durationMs: elapsed(start) };
  } catch (err: any) {
    return {
      ok: false,
      output: '',
      error: err?.message ?? String(err),
      durationMs: elapsed(start),
    };
  }
}

/** Write a file (creating parent dirs). Overwrites by design — guard upstream via safety.ts. */
export async function writeFile(path: string, content: string): Promise<ActionResult> {
  const start = Date.now();
  try {
    await mkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, content, 'utf8');
    return { ok: true, output: `Wrote ${content.length} bytes to ${path}`, durationMs: elapsed(start) };
  } catch (err: any) {
    return {
      ok: false,
      output: '',
      error: err?.message ?? String(err),
      durationMs: elapsed(start),
    };
  }
}

/** Read a file's contents as UTF-8 text. */
export async function readFile(path: string): Promise<ActionResult> {
  const start = Date.now();
  try {
    const content = await fsReadFile(path, 'utf8');
    return { ok: true, output: content, durationMs: elapsed(start) };
  } catch (err: any) {
    return {
      ok: false,
      output: '',
      error: err?.message ?? String(err),
      durationMs: elapsed(start),
    };
  }
}

/** POSIX-style single-quote so a value can't break out of the shell arg. */
function quoteForShell(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
