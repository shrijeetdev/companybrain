import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Actor, ErrorCode } from '@companybrain/types';

/** Thrown inside tool handlers for input problems detected by the MCP layer itself. */
export class ToolInputError extends Error {
  constructor(message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ToolInputError';
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'bad_request', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'rate_limited', 'internal',
]);

/** AppError detection by shape, so it works even if two copies of @companybrain/types are loaded. */
export function isAppError(err: unknown): err is Error & { code: ErrorCode; details?: Record<string, unknown> } {
  if (!(err instanceof Error)) return false;
  const code = (err as unknown as { code?: unknown }).code;
  return typeof code === 'string' && ERROR_CODES.has(code);
}

export function hasWriteScope(actor: Actor): boolean {
  return actor.via !== 'api_key' || (actor.scopes ?? []).includes('write');
}

export const READ_ONLY_MESSAGE =
  "This API key is read-only (scope: read), so it can look at work but not change it. " +
  "Ask a companybrain admin or manager to issue a key with the 'write' scope (Team → the agent → API keys), " +
  'then reconnect with the new key. Read tools (get_my_work, list_tasks, get_task, search, …) still work.';

export function errorResult(message: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    ...(structured ? { structuredContent: { error: structured } } : {}),
  };
}

/** Map any thrown value to a tool result with isError: true. Never throws. */
export function toToolError(err: unknown, actor: Actor): CallToolResult {
  if (err instanceof ToolInputError) {
    return errorResult(err.message, { code: 'bad_request', message: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (isAppError(err)) {
    const { code, message, details } = err;
    let text: string;
    switch (code) {
      case 'forbidden':
        text = hasWriteScope(actor)
          ? `Not allowed: ${message}. Your role (${actor.role}) does not permit this action.`
          : READ_ONLY_MESSAGE;
        break;
      case 'not_found':
        text = `Not found: ${message}. Use list_tasks, search or get_my_work to find the right id.`;
        break;
      case 'bad_request':
        text = `Invalid request: ${message}`;
        break;
      case 'unauthorized':
        text = `Unauthorized: ${message}. The API key may have been revoked or expired — ask an admin for a new one.`;
        break;
      case 'conflict':
        text = `Conflict: ${message}. Re-read the task with get_task and try again.`;
        break;
      case 'rate_limited':
        text = `Rate limited: ${message}. Wait a moment and retry.`;
        break;
      default:
        text = `companybrain had an internal error: ${message}`;
    }
    return errorResult(text, { code, message, ...(details ? { details } : {}) });
  }
  const message = err instanceof Error ? err.message : String(err);
  // stderr only — stdout may be the stdio JSON-RPC channel.
  console.error('[companybrain mcp] unexpected tool error:', err);
  return errorResult(`companybrain had an unexpected error: ${message}`, { code: 'internal', message });
}
