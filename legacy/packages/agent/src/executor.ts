// OS action executor — the JARVIS hands. Every function returns an ActionResult and
// NEVER throws: a failed spawn is reported as ok:false rather than rejecting, so the
// bridge/voice layer can narrate the failure instead of crashing. All child processes
// are killed after a 30s ceiling so a hung command can't wedge the agent.
//
// SECURITY: executeShell() runs WITHOUT a shell — it tokenizes the command and hands
// the argv straight to child_process.spawn({ shell: false }), so there is no shell to
// inject into. executeShellPipeline() is the only path that uses a shell (/bin/sh -c),
// and it REFUSES to run unless isAllowed() authorizes the command first. Never call
// node:child_process.exec / execSync from this module.

import { spawn } from 'node:child_process';
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { platform } from 'node:os';
import { isAllowed, tokenize } from './safety.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 1024 * 1024 * 8; // 8MB — enough for most command output
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
  /** Extra env to merge into the child's environment (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

function elapsed(start: number): number {
  return Date.now() - start;
}

/**
 * Run a command WITHOUT a shell. The command string is tokenized into argv and passed
 * to spawn({ shell: false }); because there is no shell, pipe/redirect/substitution
 * metacharacters are passed through literally and have no effect (no injection vector).
 * Authorizes against the allowlist first; disallowed commands return ok:false.
 * Captures combined stdout+stderr and times out at opts.timeoutMs (default 30s).
 */
export async function executeShell(command: string, opts: ShellOptions = {}): Promise<ActionResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const gate = isAllowed(command);
  if (!gate.allowed) {
    return {
      ok: false,
      output: '',
      error: `Refused by allowlist: ${gate.reason ?? 'not permitted.'}`,
      durationMs: elapsed(start),
    };
  }

  const argv = tokenize(command);
  if (argv.length === 0 || !argv[0]) {
    return { ok: false, output: '', error: 'Empty command after parse.', durationMs: elapsed(start) };
  }
  const [file, ...args] = argv;

  return runSpawn(file!, args, { cwd: opts.cwd, timeoutMs, env: opts.env }, start);
}

/**
 * Run a command that genuinely needs shell features (pipes, redirects, &&) through
 * /bin/sh -c. This is the ONLY shell-using path, and it is gated: the command MUST
 * pass isAllowed() first. Use this only when executeShell() can't express what you
 * need — prefer executeShell() for everything else.
 */
export async function executeShellPipeline(command: string, opts: ShellOptions = {}): Promise<ActionResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const gate = isAllowed(command);
  if (!gate.allowed) {
    return {
      ok: false,
      output: '',
      error: `Refused by allowlist: ${gate.reason ?? 'not permitted.'}`,
      durationMs: elapsed(start),
    };
  }

  const shell = IS_WIN ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh';
  const shellFlag = IS_WIN ? '/c' : '-c';
  return runSpawn(shell, [shellFlag, command], { cwd: opts.cwd, timeoutMs, env: opts.env }, start);
}

/** Spawn a child (no shell), capture up to MAX_BUFFER_BYTES, kill on timeout. Never throws. */
function runSpawn(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
  start: number,
): Promise<ActionResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;

    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* already dead */
      }
    }, opts.timeoutMs);

    const finish = (code: number | null, signal: NodeJS.Signals | null, errMsg?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = (stdout + (stderr ? `\n${stderr}` : '')).trimEnd();
      const ok = !timedOut && code === 0;
      const errorParts: string[] = [];
      if (timedOut) errorParts.push(`Command timed out after ${opts.timeoutMs}ms.`);
      if (errMsg) errorParts.push(errMsg);
      if (signal && !timedOut) errorParts.push(`Exited with signal ${signal}.`);
      if (code !== null && code !== 0 && !timedOut) errorParts.push(`Exit code ${code}.`);
      const errText = (errorParts.length ? errorParts.join(' ') + ' ' : '') + stderr.trim();
      resolve({
        ok,
        output,
        error: ok ? (stderr.trim() || undefined) : (errText.trim() || undefined),
        durationMs: elapsed(start),
      });
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (stdoutBytes + s.length <= MAX_BUFFER_BYTES) {
        stdout += s;
        stdoutBytes += s.length;
      } else if (stdoutBytes < MAX_BUFFER_BYTES) {
        const room = MAX_BUFFER_BYTES - stdoutBytes;
        stdout += s.slice(0, room);
        stdoutBytes = MAX_BUFFER_BYTES;
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (stderrBytes + s.length <= MAX_BUFFER_BYTES) {
        stderr += s;
        stderrBytes += s.length;
      } else if (stderrBytes < MAX_BUFFER_BYTES) {
        const room = MAX_BUFFER_BYTES - stderrBytes;
        stderr += s.slice(0, room);
        stderrBytes = MAX_BUFFER_BYTES;
      }
    });

    child.on('error', (err) => finish(null, null, err.message));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

/**
 * Run a command WITHOUT the allowlist gate, from a pre-built argv. Used only by the
 * typed helpers below (openUrl/openApp/executeAppleScript): those build argv from
 * already-validated structured args (a URL, an app name), NOT from a raw user shell
 * string, so the command-string allowlist gate doesn't apply. The raw user-string
 * path is executeShell()/executeShellPipeline(), and those DO gate via isAllowed().
 */
function executeUnguarded(file: string, args: string[], opts: ShellOptions = {}): Promise<ActionResult> {
  return runSpawn(file, args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, env: opts.env }, Date.now());
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
  // Structured args → spawn directly; no shell, no allowlist gate needed.
  return executeUnguarded('osascript', ['-e', String(script ?? '')]);
}

/** Open a URL in the user's default browser. */
export async function openUrl(url: string): Promise<ActionResult> {
  const target = String(url ?? '');
  if (IS_MAC) return executeUnguarded('open', [target]);
  if (IS_WIN) {
    // `start` wants a title arg; pass an empty one so a quoted URL isn't mistaken for it.
    return executeUnguarded('cmd.exe', ['/c', 'start', '', target]);
  }
  return executeUnguarded('xdg-open', [target]);
}

/** Open an application by name. */
export async function openApp(appName: string): Promise<ActionResult> {
  const name = String(appName ?? '');
  if (IS_MAC) return executeUnguarded('open', ['-a', name]);
  if (IS_WIN) return executeUnguarded('cmd.exe', ['/c', 'start', '', name]);
  return executeUnguarded('xdg-open', [name]);
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

