// Minimal MCP server — JSON-RPC 2.0 over stdio. Implements the 2024-11-05 spec shape
// for the methods an MCP host (VS Code, Claude Desktop, etc.) actually calls:
// `initialize`, `notifications/initialized`, `tools/list`, `tools/call`.
//
// Reads newline-delimited JSON requests from stdin and writes one JSON response per
// line to stdout. Notifications (no `id`) get no response. No dependencies — only
// node:readline + node builtins — so this can run as a bare `node` / `tsx` process.

import { createInterface } from 'node:readline';
import type { Core } from '@companybrain/core';
import { TOOLS, findTool, type ToolContext } from './tools.js';

export interface McpServerOptions {
  core: Core;
  name?: string;
  version?: string;
  /** Optional identity used by tool handlers (defaults to local single-user org). */
  context?: ToolContext;
}

const PROTOCOL_VERSION = '2024-11-05';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function startMcpServer(opts: McpServerOptions): void {
  const { core, context } = opts;
  const serverName = opts.name ?? 'companybrain';
  const serverVersion = opts.version ?? '0.1.0';

  const write = (res: JsonRpcResponse): void => {
    process.stdout.write(JSON.stringify(res) + '\n');
  };

  const handle = async (req: JsonRpcRequest): Promise<JsonRpcResponse | null> => {
    const id = req.id ?? null;

    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: serverName, version: serverVersion },
          },
        };

      case 'notifications/initialized':
        // Notification — no response per spec.
        return null;

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        };

      case 'tools/call': {
        const params = req.params ?? {};
        const name = params.name;
        const args = params.arguments ?? {};
        const tool = findTool(name);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: ERROR_CODES.METHOD_NOT_FOUND, message: `Unknown tool: ${name}` },
          };
        }
        try {
          const output = await tool.handler(args, core, context ?? {});
          // MCP returns tool results as a list of content blocks; text is the common case.
          const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text }], isError: false },
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Tool "${name}" failed: ${message}` }],
              isError: true,
            },
          };
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: ERROR_CODES.METHOD_NOT_FOUND, message: `Method not found: ${req.method}` },
        };
    }
  };

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      write({
        jsonrpc: '2.0',
        id: null,
        error: { code: ERROR_CODES.PARSE_ERROR, message: 'Parse error' },
      });
      return;
    }

    // Batch requests: spec allows an array of requests → array of responses.
    if (Array.isArray(req)) {
      void Promise.all(req.map((r) => handle(r))).then((responses) => {
        const filtered = responses.filter((r): r is JsonRpcResponse => r !== null);
        if (filtered.length) write({ jsonrpc: '2.0', id: null, result: filtered } as JsonRpcResponse);
      });
      return;
    }

    void handle(req).then((response) => {
      if (response) write(response);
    });
  });

  // Keep nothing buffered so the host gets lines immediately.
  process.stdout.on('error', () => {
    /* host gone away — ignore */
  });
}
