// @companybrain/agent — the JARVIS layer: classify a natural-language command into an
// intent, gate destructive OS actions behind a human confirm-tap, execute them, log
// everything, and mirror task creation into the companybrain core. Zero npm deps.

export { handleCommand, type BridgeDeps, type BridgeLogEntry, type HandleResult } from './bridge.js';
export {
  classifyIntent,
  classifyWithHeuristics,
  type IntentType,
  type ClassifiedIntent,
  type Llm as IntentLlm,
} from './intent.js';
export {
  classifyCommand,
  formatConfirmPrompt,
  isAllowed,
  hasInjectionOrDestructiveComposition,
  tokenize,
  ALLOWED_COMMANDS,
  type RiskLevel,
  type CommandRisk,
  type AllowedCommand,
  type AllowedRisk,
  type AllowedResult,
} from './safety.js';
export {
  executeShell,
  executeShellPipeline,
  executeAppleScript,
  openUrl,
  openApp,
  createFolder,
  writeFile,
  readFile,
  type ActionResult,
  type ShellOptions,
} from './executor.js';
