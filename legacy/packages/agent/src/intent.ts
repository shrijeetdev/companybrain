// Intent classification — turns a free-text voice/typed command into a structured
// intent the bridge can act on. Two modes:
//   • LLM mode (Claude/GPT): a system prompt enumerates the intent types and asks for
//     a JSON reply. We parse defensively and fall back to heuristics on any failure.
//   • Heuristic mode (no llm): regexes map common phrasings ("create task …",
//     "open youtube", "make folder …", "$cmd", "run cmd") onto intents.
//
// The contract is intentionally narrow: classifyIntent returns one ClassifiedIntent,
// never throws. Unknown input becomes { type: 'unknown' }.

export type IntentType =
  | 'create_task'
  | 'shell_command'
  | 'open_app'
  | 'open_url'
  | 'create_folder'
  | 'write_file'
  | 'read_file'
  | 'search_youtube'
  | 'send_message'
  | 'unknown';

export interface ClassifiedIntent {
  type: IntentType;
  args: Record<string, any>;
  /** 0–1. LLM path is trusted (0.9); heuristics report how strongly they matched. */
  confidence: number;
  rawCommand: string;
}

export interface Llm {
  complete: (prompt: string) => Promise<string>;
}

const SYSTEM_PROMPT = `You classify a natural-language command into exactly one intent type and extract its arguments.
Respond with ONLY a JSON object, no prose. Schema:
{ "type": "<IntentType>", "args": { ... }, "confidence": 0.0-1.0 }

IntentType values and their args:
- create_task     args: { title: string, day?: "today"|"tomorrow"|"upcoming", priority?: "low"|"med"|"high" }
- shell_command   args: { command: string }
- open_app        args: { appName: string }
- open_url        args: { url: string }
- create_folder   args: { path: string }
- write_file      args: { path: string, content: string }
- read_file       args: { path: string }
- search_youtube  args: { query: string }
- send_message    args: { to: string, text: string }
- unknown         args: {}

Rules:
- For "search youtube for X" or "youtube X", use search_youtube with the query (NOT open_url).
- For a raw shell command (often prefixed with "$" or "run "), use shell_command.
- If you cannot confidently map the command, return "unknown".
- Output JSON only.`;

/** LLM-backed classification with heuristic fallback. */
export async function classifyIntent(command: string, llm?: Llm): Promise<ClassifiedIntent> {
  const raw = String(command ?? '').trim();
  if (!raw) return { type: 'unknown', args: {}, confidence: 1, rawCommand: raw };

  if (llm) {
    const llmResult = await classifyWithLlm(raw, llm);
    if (llmResult) return llmResult;
  }

  return classifyWithHeuristics(raw);
}

async function classifyWithLlm(command: string, llm: Llm): Promise<ClassifiedIntent | null> {
  try {
    const raw = await llm.complete(`${SYSTEM_PROMPT}\n\nCommand: ${command}`);
    const text = raw.trim();
    // Be tolerant of ```json fences / surrounding prose.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ClassifiedIntent>;
    if (!parsed.type || typeof parsed.type !== 'string') return null;
    return {
      type: parsed.type as IntentType,
      args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {},
      confidence: typeof parsed.confidence === 'number' ? clamp(parsed.confidence) : 0.9,
      rawCommand: command,
    };
  } catch {
    return null;
  }
}

/** Regex heuristics — the zero-AI brain. Order matters: most specific first. */
export function classifyWithHeuristics(command: string): ClassifiedIntent {
  const raw = command.trim();
  const lower = raw.toLowerCase();

  // Raw shell: a leading "$" or "run <cmd>".
  if (raw.startsWith('$')) {
    return { type: 'shell_command', args: { command: raw.slice(1).trim() }, confidence: 0.9, rawCommand: raw };
  }
  const runMatch = lower.match(/^run\s+(.+)$/);
  if (runMatch && runMatch[1]) {
    return { type: 'shell_command', args: { command: raw.slice(4).trim() }, confidence: 0.8, rawCommand: raw };
  }

  // Create task: "create task X", "add task X", "remind me to X".
  const taskMatch = raw.match(/^(?:create|add)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i)
    ?? raw.match(/^remind\s+me\s+to\s+(.+)$/i);
  if (taskMatch && taskMatch[1]) {
    const { title, day, priority } = parseTaskHints(taskMatch[1]);
    return { type: 'create_task', args: { title, day, priority }, confidence: 0.85, rawCommand: raw };
  }

  // Search YouTube: "search youtube for X" / "youtube X".
  const ytSearch = raw.match(/^(?:search\s+youtube\s+(?:for\s+)?|youtube\s+)(.+)$/i);
  if (ytSearch && ytSearch[1]) {
    return { type: 'search_youtube', args: { query: ytSearch[1].trim() }, confidence: 0.9, rawCommand: raw };
  }
  if (/^(open\s+)?youtube(\s|$)/i.test(raw)) {
    return { type: 'open_url', args: { url: 'https://youtube.com' }, confidence: 0.7, rawCommand: raw };
  }

  // Make/create folder <path>.
  const folderMatch = raw.match(/^(?:make|create)\s+(?:a\s+)?(?:folder|directory)\s+(.+)$/i);
  if (folderMatch && folderMatch[1]) {
    return { type: 'create_folder', args: { path: stripQuotes(folderMatch[1]).trim() }, confidence: 0.85, rawCommand: raw };
  }

  // Write file <path> [with|saying|containing] <content>  (or "save <content> to <path>").
  const writeFileMatch = raw.match(/^(?:write|save)\s+(?:file\s+)?(.+?)\s+(?:with|saying|containing|=)\s+(.+)$/i);
  if (writeFileMatch && writeFileMatch[1] && writeFileMatch[2]) {
    return {
      type: 'write_file',
      args: { path: stripQuotes(writeFileMatch[1]).trim(), content: writeFileMatch[2].trim() },
      confidence: 0.8,
      rawCommand: raw,
    };
  }

  // Read file <path>.
  const readFileMatch = raw.match(/^read\s+(?:file\s+)?(.+)$/i);
  if (readFileMatch && readFileMatch[1] && /\.(txt|md|json|js|ts|csv|log|yml|yaml|html|css)$/i.test(readFileMatch[1])) {
    return { type: 'read_file', args: { path: stripQuotes(readFileMatch[1]).trim() }, confidence: 0.75, rawCommand: raw };
  }

  // Open app: "open <name>" (only if it doesn't look like a URL/path).
  const openMatch = raw.match(/^open\s+(.+)$/i);
  if (openMatch && openMatch[1]) {
    const target = openMatch[1].trim();
    if (/^https?:\/\//i.test(target)) {
      return { type: 'open_url', args: { url: target }, confidence: 0.95, rawCommand: raw };
    }
    if (/^[\w-]+(?:\.[\w-]+)+/.test(target)) {
      // looks like a domain → open as URL.
      return { type: 'open_url', args: { url: `https://${target}` }, confidence: 0.7, rawCommand: raw };
    }
    return { type: 'open_app', args: { appName: target }, confidence: 0.7, rawCommand: raw };
  }

  // Send message: "message <to> <text>" / "text <to> <text>".
  const msgMatch = raw.match(/^(?:message|text|whatsapp)\s+(\S+)\s+(.+)$/i);
  if (msgMatch && msgMatch[1] && msgMatch[2]) {
    return { type: 'send_message', args: { to: msgMatch[1], text: msgMatch[2].trim() }, confidence: 0.6, rawCommand: raw };
  }

  return { type: 'unknown', args: {}, confidence: 0, rawCommand: raw };
}

/** Pull "today/tomorrow/upcoming" and "high/med/low priority" out of a task title. */
function parseTaskHints(title: string): { title: string; day?: 'today' | 'tomorrow' | 'upcoming'; priority?: 'low' | 'med' | 'high' } {
  let day: 'today' | 'tomorrow' | 'upcoming' | undefined;
  let priority: 'low' | 'med' | 'high' | undefined;
  let cleaned = title;

  for (const d of ['today', 'tomorrow', 'upcoming'] as const) {
    const re = new RegExp(`\\b${d}\\b`, 'i');
    if (re.test(cleaned)) {
      day = d;
      cleaned = cleaned.replace(re, '').replace(/\s{2,}/g, ' ').trim();
      break;
    }
  }
  const prioMatch = cleaned.match(/\b(high|med(?:ium)?|low)\s+priority\b/i);
  if (prioMatch && prioMatch[1]) {
    priority = prioMatch[1].toLowerCase().startsWith('med') ? 'med' : (prioMatch[1].toLowerCase() as 'high' | 'low');
    cleaned = cleaned.replace(prioMatch[0], '').replace(/\s{2,}/g, ' ').trim();
  }
  return { title: cleaned, day, priority };
}

function stripQuotes(s: string): string {
  return s.replace(/^["'`]|["'`]$/g, '');
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
