import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Actor, InboundMessage, IntegrationsStatus } from '@companybrain/types';
import { buildServer, type ServerDeps } from '../src/index';
import { createFakeServices, type Fake, type FakeOptions } from './fake-services';

export interface Harness {
  app: FastifyInstance;
  fake: Fake;
  deps: ServerDeps;
  mcpCalls: { actor: Actor; method: string | undefined; body: unknown }[];
  inbound: InboundMessage[];
  ttsCalls: string[];
  qr: { started: number; loggedOut: number };
  /** Cookie header value for a fresh session of the member. */
  cookie(m?: keyof Fake['members']): string;
  bearer(m?: keyof Fake['members'], scopes?: ('read' | 'write')[]): string;
}

export type DepsPatch = {
  [K in keyof ServerDeps]?: ServerDeps[K] extends object ? Partial<ServerDeps[K]> : ServerDeps[K];
};

export function makeWebDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cb-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body><div id="root">SPA_INDEX</div></body></html>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("app")');
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {})');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"companybrain"}');
  return dir;
}

export async function harness(patch: DepsPatch = {}, fakeOpts: FakeOptions = {}): Promise<Harness> {
  const fake = createFakeServices(fakeOpts);
  const mcpCalls: Harness['mcpCalls'] = [];
  const inbound: InboundMessage[] = [];
  const ttsCalls: string[] = [];
  const qr = { started: 0, loggedOut: 0 };
  const status: IntegrationsStatus = {
    whatsapp: { mode: 'qr', connected: false, phone: null },
    email: { inbound: false, outbound: false, address: null },
    push: true,
    llm: { provider: null },
    tts: { provider: null },
  };
  const deps: ServerDeps = {
    services: fake.services,
    tts: null,
    integrations: {
      config: {},
      status: () => status,
      whatsappQr: {
        async start() {
          qr.started++;
        },
        async logout() {
          qr.loggedOut++;
        },
        status: () => ({ status: 'pairing', qr: 'data:image/png;base64,AAAA', phone: null }),
        send: async () => true,
      },
      onInbound: async (msg) => {
        inbound.push(msg);
        return { reply: null };
      },
      sendTest: async () => ({ ok: true }),
      ...patch.integrations,
    },
    mcp: {
      handleHttp: async (_services, actor, req, res, body) => {
        mcpCalls.push({ actor, method: req.method, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true, member: actor.memberId } }));
      },
      ...patch.mcp,
    },
    clock: patch.clock,
    config: {
      version: '2.0.0-test',
      publicUrl: null,
      webDir: null,
      trustProxy: false,
      secureCookies: 'auto',
      corsOrigins: [],
      emailWebhookSecret: null,
      signingSecret: 'test-signing-secret-0123456789abcdef',
      logLevel: 'silent',
      ...patch.config,
    },
  };
  if ('tts' in patch) deps.tts = patch.tts ?? null;
  if (deps.tts) {
    const inner = deps.tts;
    deps.tts = {
      synthesize: async (text, o) => {
        ttsCalls.push(text);
        return inner.synthesize(text, o);
      },
    };
  }
  const app = await buildServer(deps);
  await app.ready();
  return {
    app,
    fake,
    deps,
    mcpCalls,
    inbound,
    ttsCalls,
    qr,
    cookie: (m = 'owner') => `cb_session=${fake.sessionFor(fake.members[m])}`,
    bearer: (m = 'owner', scopes) => `Bearer ${fake.keyFor(fake.members[m], scopes)}`,
  };
}

export const WEB = { 'x-cb-client': 'web' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function json(res: { body: string }): any {
  return JSON.parse(res.body);
}

/** Wait until `fn` returns truthy (polling). */
export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}
