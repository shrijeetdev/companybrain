# companybrain v2 — cross-package wiring contract

Each package exports EXACTLY these entry points (plus anything else it likes). Workstreams
build in parallel against these signatures; the lead wires them together in `cli/bin/companybrain.ts`.

## @companybrain/nlp
```ts
export interface ParseOptions { now: number; timezone: string; defaultHour?: number }
export function parseQuickAdd(text: string, opts: ParseOptions): ParsedQuickAdd;
```

## @companybrain/db
```ts
export function resolveDbPath(env?: NodeJS.ProcessEnv): string;     // $COMPANYBRAIN_DB_PATH or ~/.companybrain/companybrain.sqlite
export function openDatabase(path: string | ':memory:'): Db;         // opens, WAL, runs migrations (incl. v1 import)
export interface Db { /* org-scoped repositories; owned by the data workstream */ close(): void; }
```

## @companybrain/core
```ts
export interface CoreOptions {
  db: Db;
  outbound?: Outbound;                 // default: no-op (all channels report not configured)
  llm?: Llm | null;
  calendar?: CalendarFetcher;          // default: throws "calendar fetch not configured"
  tts?: Tts | null;
  vapidPublicKey?: string | null;
  clock?: () => number;                // default Date.now — tests inject a fake clock
  log?: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
}
export interface Core {
  services: CoreServices;
  scheduler: { start(intervalMs?: number): void; stop(): Promise<void>; tick(): Promise<number> };
  /** Used by server for /api/briefing/audio */
  tts: Tts | null;
}
export function createCore(opts: CoreOptions): Core;
```

## @companybrain/integrations
```ts
export interface IntegrationsConfig { /* parsed from env; see .env.example */ }
export function loadIntegrationsConfig(env?: NodeJS.ProcessEnv, dataDir?: string): IntegrationsConfig;
export function createOutbound(cfg: IntegrationsConfig, qr?: WhatsAppQr | null): Outbound;
export function createLlm(cfg: IntegrationsConfig): Llm | null;
export function createTts(cfg: IntegrationsConfig): Tts | null;
export function createCalendarFetcher(): CalendarFetcher;           // SSRF-safe
export function getVapidKeys(cfg: IntegrationsConfig): { publicKey: string; privateKey: string };  // env or generated+persisted in dataDir

// Inbound
export type OnInbound = (msg: InboundMessage) => Promise<{ reply: string | null }>;
export const whatsappCloud: {
  verifyChallenge(cfg, query: Record<string, string>): string | null;       // GET hub.challenge
  verifySignature(cfg, rawBody: Buffer, signatureHeader: string | undefined): boolean;
  parseWebhook(body: unknown): InboundMessage[];
};
export interface WhatsAppQr {
  start(): Promise<void>; logout(): Promise<void>;
  status(): { status: 'disconnected' | 'pairing' | 'connected'; qr: string | null /* data URL */; phone: string | null };
  send(to: string, text: string): Promise<boolean>;
}
export function createWhatsAppQr(cfg: IntegrationsConfig, onInbound: OnInbound): WhatsAppQr;   // lazy-imports baileys
export interface EmailPoller { start(): void; stop(): Promise<void>; pollOnce(): Promise<number> }
export function createEmailPoller(cfg: IntegrationsConfig, onInbound: OnInbound): EmailPoller | null;   // null if IMAP not configured
export function parseInboundEmailWebhook(body: unknown): InboundMessage | null;   // generic (Postmark/SendGrid/Mailgun/Cloudflare shapes)
export function integrationsStatus(cfg: IntegrationsConfig, qr?: WhatsAppQr | null): IntegrationsStatus;  // shape of GET /api/integrations minus mcpUrl
```

## @companybrain/mcp
```ts
export const MCP_INSTRUCTIONS: string;
export function createMcpServer(services: CoreServices, actor: Actor): McpServer;   // from @modelcontextprotocol/sdk
/** Stateless Streamable HTTP: one server+transport per request. Caller has already authenticated `actor`. */
export function handleMcpHttp(services: CoreServices, actor: Actor, req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void>;
/** stdio: resolves the key → actor itself, never writes anything but JSON-RPC to stdout. */
export function runMcpStdio(services: CoreServices, rawKey: string): Promise<void>;
```

## @companybrain/server
```ts
export interface ServerDeps {
  services: CoreServices;
  tts: Tts | null;
  integrations: {
    config: IntegrationsConfig;
    status(): IntegrationsStatus;
    whatsappQr: WhatsAppQr | null;
    onInbound: OnInbound;                 // server calls this for webhook messages
    sendTest(actor: Actor, channel: 'whatsapp' | 'email' | 'push'): Promise<{ ok: boolean; error?: string }>;
  };
  mcp: { handleHttp: typeof handleMcpHttp };
  config: {
    version: string;
    publicUrl: string | null;            // COMPANYBRAIN_PUBLIC_URL, used for MCP URL + links
    webDir: string | null;               // path to built SPA (dist/web); null → API only
    trustProxy: boolean | number | string;
    secureCookies: 'auto' | boolean;
    corsOrigins: string[];               // empty = same-origin only
    emailWebhookSecret: string | null;
    logLevel: string;
  };
}
export function buildServer(deps: ServerDeps): Promise<FastifyInstance>;
```

## cli
`companybrain` → load env → `openDatabase` → integrations → `createCore` → `buildServer` → listen →
`scheduler.start()` → email poller / WhatsApp QR start. `companybrain mcp` → stdio ONLY (no web server,
nothing on stdout except JSON-RPC, logs to stderr).

## @companybrain/game (Tactical Ops)
```ts
export interface GameOptions {
  sqlite: import('better-sqlite3').Database;    // same connection as @companybrain/db (Db.sqlite)
  services: CoreServices;                       // read members/tasks/projects; publish via services.live
  clock?: () => number;
}
export interface Game {
  service: GameService;
  /** Feed every audit event here (core calls CoreOptions.onAudit). Never throws. */
  onAudit(e: AuditEvent): Promise<void>;
}
export function createGame(opts: GameOptions): Game;
```
Core additions: `CoreOptions.onAudit?: (e: AuditEvent) => void | Promise<void>` (called after every audit
write, errors swallowed + logged, never blocks the request beyond one await) and `Db.sqlite` (the raw
better-sqlite3 handle). Wiring: `const game = createGame({ sqlite: db.sqlite, services: core.services })`,
then `createCore({ ..., onAudit: (e) => game.onAudit(e) })` — use a late-bound callback since the game
needs core.services first. `AppServices = { ...core.services, game: game.service }` goes to server + MCP.
