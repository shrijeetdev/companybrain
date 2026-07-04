// Safety guards for OS command execution. classifyCommand() runs every shell/file
// action through a denylist/regex pass before it ever reaches child_process, and the
// bridge uses it to decide whether to tap the user for confirmation. The goal is:
// destructive operations can NEVER run without an explicit yes, and even cautionary
// ones ask first.

export type RiskLevel = 'safe' | 'caution' | 'destructive';

export interface CommandRisk {
  level: RiskLevel;
  /** why this level was chosen — shown to the human in the confirm prompt. */
  reason: string;
  /** true for caution + destructive; safe commands run without prompting. */
  requiresConfirm: boolean;
}

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
 * Assess the risk of a command string. The first matching destructive pattern wins
 * (most conservative); otherwise the first caution pattern; otherwise safe.
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
