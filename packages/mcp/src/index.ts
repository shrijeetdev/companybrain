// @companybrain/mcp — MCP tools over AppServices (core + game); stdio + stateless Streamable HTTP.
// See docs/v2/WIRING.md for the exported contract and packages/mcp/CONNECT.md for client setup.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Actor, AppServices } from '@companybrain/types';
import pkg from '../package.json' with { type: 'json' };
import { MCP_INSTRUCTIONS } from './instructions.js';
import { registerTools } from './tools.js';

export { MCP_INSTRUCTIONS } from './instructions.js';
export { TOOL_NAMES } from './tools.js';

export const MCP_SERVER_NAME = 'companybrain';
export const MCP_SERVER_VERSION: string = pkg.version;

export interface McpServerOptions {
  /** Clock override (tests). Default Date.now. */
  clock?: () => number;
  /** Supplies the actor per tool call (stdio re-resolves the key so revocation and lastSeen stay live). */
  getActor?: () => Promise<Actor>;
}

/** Create an MCP server with every companybrain tool bound to `actor`. */
export function createMcpServer(services: AppServices, actor: Actor, opts: McpServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, title: 'companybrain', version: MCP_SERVER_VERSION },
    { instructions: MCP_INSTRUCTIONS, capabilities: { tools: { listChanged: false } } },
  );
  registerTools(server, {
    services,
    getActor: opts.getActor ?? (async () => actor),
    clock: opts.clock ?? Date.now,
  });
  return server;
}

function sendJsonRpcError(res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/** Ensure Accept lists both JSON and SSE (the SDK requires it; JSON responses are enabled anyway). */
function normalizeAccept(req: IncomingMessage): void {
  const accept = String(req.headers.accept ?? '');
  if (accept.includes('application/json') && accept.includes('text/event-stream')) return;
  const value = 'application/json, text/event-stream';
  const raw: string[] = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]!.toLowerCase() !== 'accept') raw.push(req.rawHeaders[i]!, req.rawHeaders[i + 1] ?? '');
  }
  raw.push('Accept', value);
  req.rawHeaders = raw;
  req.headers.accept = value;
}

/**
 * Stateless Streamable HTTP: one server + transport per request. The caller has already
 * authenticated `actor`. Only POST is supported (no sessions, no server-initiated stream):
 * GET and DELETE get 405 per the MCP spec. Responses are plain JSON (no SSE needed).
 *
 * Fastify: `reply.hijack(); await handleMcpHttp(services, actor, request.raw, reply.raw, request.body)`.
 */
export async function handleMcpHttp(services: AppServices, actor: Actor, req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void> {
  if (req.method !== 'POST') {
    sendJsonRpcError(res, 405, -32000, 'Method not allowed. This MCP endpoint is stateless: send JSON-RPC requests with POST.', { allow: 'POST' });
    return;
  }
  normalizeAccept(req);
  const server = createMcpServer(services, actor);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  };
  res.on('close', cleanup);
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (err) {
    console.error('[companybrain mcp] HTTP request failed:', err);
    sendJsonRpcError(res, 500, -32603, 'Internal server error');
    cleanup();
  }
}

/**
 * stdio transport for desktop hosts. Resolves the key itself; on failure prints to stderr and
 * exits with code 2. Nothing but JSON-RPC is ever written to stdout (console.log/info/debug are
 * redirected to stderr). Resolves when the client disconnects (stdin closes).
 */
export async function runMcpStdio(services: AppServices, rawKey: string): Promise<void> {
  const toStderr = (...args: unknown[]) => console.error(...args);
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;

  const key = (rawKey ?? '').trim();
  let actor: Actor | null = null;
  let reason = 'no API key given';
  if (key) {
    try {
      actor = await services.auth.resolveApiKey(key);
      if (!actor) reason = 'the key is invalid, revoked or expired';
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
  }
  if (!actor) {
    process.stderr.write(
      `companybrain mcp: cannot authenticate (${reason}).\n` +
      'Set COMPANYBRAIN_MCP_KEY to an API key (cb_live_…) created in companybrain under Team → <agent> → API keys.\n',
    );
    process.exit(2);
  }

  let current: Actor = actor;
  const server = createMcpServer(services, actor, {
    // Re-resolve per call: honours revocation/expiry and keeps the agent's lastSeenAt fresh
    // (so a long-running session is never flagged stale while it is working).
    getActor: async () => {
      const a = await services.auth.resolveApiKey(key);
      if (!a) throw new Error('the API key is no longer valid (revoked, expired or member deactivated)');
      current = a;
      return current;
    },
  });
  const transport = new StdioServerTransport();
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      void server.close().catch(() => {}).finally(resolve);
    };
    transport.onclose = finish;
    process.stdin.once('end', finish);
    process.stdin.once('close', finish);
    server.connect(transport).catch(reject);
  });
}
