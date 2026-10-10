// OAuth 2.1 "paste the URL and it connects" for MCP clients (Claude.ai, ChatGPT, …).
//
// - Stateless dynamic client registration: client_id = base64url(json) + "." + HMAC(signingSecret).
// - /oauth/authorize validates, then hands off to the SPA consent page (/connect?...).
// - /api/oauth/approve (session + CSRF) mints an API key and parks it under a random,
//   single-use, 5-minute code (in memory).
// - /oauth/token exchanges code + PKCE S256 verifier for the raw API key (the access token).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, type Actor, type ApiScope } from '@companybrain/types';
import type { ServerDeps } from './types';
import { apiRoute, json, type RouteDef } from './route';
import { requireRole, type Limiter } from './auth';
import { baseUrl } from './origin';
import * as S from './schemas';

export const CODE_TTL_MS = 5 * 60_000;
const MAX_PENDING_CODES = 10_000;
const MAX_CLIENT_ID_LEN = 4096;
const SCOPES: ApiScope[] = ['read', 'write'];
const PKCE_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

// ─── Client ids ─────────────────────────────────────────────────────────────

export interface OAuthClient {
  name: string;
  redirectUris: string[];
  issuedAt: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function mac(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(`cb-oauth-client:v1:${payload}`).digest();
}

export function signClientId(secret: string, c: OAuthClient): string {
  const payload = b64u(JSON.stringify({ n: c.name, r: c.redirectUris, t: c.issuedAt }));
  return `${payload}.${b64u(mac(secret, payload))}`;
}

export function verifyClientId(secret: string, clientId: unknown): OAuthClient | null {
  if (typeof clientId !== 'string' || clientId.length > MAX_CLIENT_ID_LEN) return null;
  const dot = clientId.indexOf('.');
  if (dot <= 0 || clientId.indexOf('.', dot + 1) !== -1) return null;
  const payload = clientId.slice(0, dot);
  let sig: Buffer;
  try {
    sig = Buffer.from(clientId.slice(dot + 1), 'base64url');
  } catch {
    return null;
  }
  const expected = mac(secret, payload);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { n?: unknown; r?: unknown; t?: unknown };
    if (typeof j.n !== 'string' || !Array.isArray(j.r) || !j.r.every((u) => typeof u === 'string')) return null;
    return { name: j.n, redirectUris: j.r as string[], issuedAt: typeof j.t === 'number' ? j.t : 0 };
  } catch {
    return null;
  }
}

/** https anywhere, or http on loopback only. No fragments, no credentials. */
export function isAllowedRedirectUri(u: string): boolean {
  if (typeof u !== 'string' || u.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.hash || u.includes('#') || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return false;
}

function cleanName(n: unknown): string {
  const s = typeof n === 'string' ? n.replace(/[\u0000-\u001f\u007f<>]/g, '').trim() : '';
  return (s || 'MCP client').slice(0, 80);
}

// ─── Authorize-request validation (shared by /oauth/authorize and /api/oauth/approve) ────

export interface AuthorizeParams {
  client: OAuthClient;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
}

type AuthorizeCheck =
  | { ok: true; p: AuthorizeParams }
  /** Client/redirect can't be trusted → show an error, never redirect. */
  | { ok: false; fatal: true; error: string; description: string }
  /** Trusted redirect → send the error back to the client. */
  | { ok: false; fatal: false; redirectTo: string };

function pick(q: Record<string, unknown>, k: string): string | null {
  const v = q[k];
  if (Array.isArray(v)) return null; // duplicated params are invalid (RFC 6749 §3.1)
  return typeof v === 'string' && v !== '' ? v : null;
}

export function withParams(uri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

export function checkAuthorize(secret: string, q: Record<string, unknown>, issuer: string): AuthorizeCheck {
  const clientId = pick(q, 'client_id');
  const client = verifyClientId(secret, clientId);
  if (!clientId || !client) return { ok: false, fatal: true, error: 'invalid_client', description: 'Unknown or invalid client_id' };
  let redirectUri = pick(q, 'redirect_uri');
  if (!redirectUri) {
    if (client.redirectUris.length !== 1) return { ok: false, fatal: true, error: 'invalid_request', description: 'redirect_uri is required' };
    redirectUri = client.redirectUris[0]!;
  }
  // Exact string match against the registered list.
  if (!client.redirectUris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
    return { ok: false, fatal: true, error: 'invalid_request', description: 'redirect_uri is not registered for this client' };
  }
  const state = pick(q, 'state');
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    fatal: false,
    redirectTo: withParams(redirectUri, { error, error_description: description, state, iss: issuer }),
  });
  if (state !== null && state.length > 1024) return fail('invalid_request', 'state too long');
  if (pick(q, 'response_type') !== 'code') return fail('unsupported_response_type', 'response_type must be "code"');
  const challenge = pick(q, 'code_challenge');
  if (!challenge || !PKCE_RE.test(challenge)) return fail('invalid_request', 'code_challenge (PKCE) is required');
  if (pick(q, 'code_challenge_method') !== 'S256') return fail('invalid_request', 'code_challenge_method must be S256');
  const scope = pick(q, 'scope');
  if (scope !== null && scope.length > 500) return fail('invalid_scope', 'scope too long');
  const resource = pick(q, 'resource');
  if (resource !== null && resource.length > 2048) return fail('invalid_target', 'resource too long');
  return { ok: true, p: { client, clientId, redirectUri, codeChallenge: challenge, state, scope, resource } };
}

// ─── Single-use code store ──────────────────────────────────────────────────

interface CodeEntry {
  raw: string;
  keyId: string;
  actor: Actor;
  clientId: string;
  redirectUri: string;
  challenge: string;
  scopes: ApiScope[];
  expiresAt: number;
  usedAt: number | null;
}

export class CodeStore {
  private codes = new Map<string, CodeEntry>();
  constructor(private now: () => number) {}

  private prune() {
    const t = this.now();
    for (const [k, v] of this.codes) if (v.expiresAt <= t) this.codes.delete(k);
  }

  put(e: Omit<CodeEntry, 'expiresAt' | 'usedAt'>): string {
    this.prune();
    if (this.codes.size >= MAX_PENDING_CODES) throw new AppError('rate_limited', 'Too many pending authorizations');
    const code = `cbc_${randomBytes(32).toString('base64url')}`;
    this.codes.set(code, { ...e, expiresAt: this.now() + CODE_TTL_MS, usedAt: null });
    return code;
  }

  /** Marks the code used and returns it (with its previous used state). */
  take(code: string): { entry: CodeEntry; replay: boolean } | null {
    const e = this.codes.get(code);
    if (!e) return null;
    const replay = e.usedAt !== null;
    e.usedAt = e.usedAt ?? this.now();
    return { entry: e, replay };
  }

  delete(code: string) {
    this.codes.delete(code);
  }
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function eq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ─── Public endpoints (/.well-known/*, /oauth/*) ────────────────────────────

function oauthError(reply: FastifyReply, status: number, error: string, description: string) {
  return reply
    .code(status)
    .header('cache-control', 'no-store')
    .header('pragma', 'no-cache')
    .type('application/json; charset=utf-8')
    .send({ error, error_description: description });
}

const OPEN_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, MCP-Protocol-Version',
  'access-control-max-age': '600',
};

function parseForm(body: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

export function protectedResourceMetadataUrl(deps: ServerDeps, req: FastifyRequest) {
  return `${baseUrl(deps.config.publicUrl, req)}/.well-known/oauth-protected-resource`;
}

export async function registerOAuthPublic(app: FastifyInstance, deps: ServerDeps, store: CodeStore, limit: Limiter) {
  const secret = deps.config.signingSecret;
  const now = () => (deps.clock ?? Date.now)();

  await app.register(async (oauth) => {
    // Browser-based MCP clients call these cross-origin: open CORS, never credentials.
    oauth.addHook('onRequest', async (_req, reply) => {
      reply.headers(OPEN_CORS);
    });
    oauth.addHook('onRequest', limit);
    oauth.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
      try {
        done(null, parseForm(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    });

    const resourceMeta = async (req: FastifyRequest) => {
      const base = baseUrl(deps.config.publicUrl, req);
      return {
        resource: `${base}/mcp`,
        authorization_servers: [base],
        scopes_supported: SCOPES,
        bearer_methods_supported: ['header'],
        resource_name: 'companybrain',
      };
    };
    const asMeta = async (req: FastifyRequest) => {
      const base = baseUrl(deps.config.publicUrl, req);
      return {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: SCOPES,
      };
    };
    const corsPaths = [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/mcp',
      '/oauth/register',
      '/oauth/token',
    ];
    for (const p of corsPaths) oauth.options(p, async (_req, reply) => reply.code(204).send());

    oauth.get('/.well-known/oauth-protected-resource', resourceMeta);
    oauth.get('/.well-known/oauth-protected-resource/mcp', resourceMeta);
    oauth.get('/.well-known/oauth-authorization-server', asMeta);
    oauth.get('/.well-known/oauth-authorization-server/mcp', asMeta);

    // RFC 7591 dynamic client registration (stateless).
    oauth.post('/oauth/register', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body !== 'object' || Array.isArray(body)) return oauthError(reply, 400, 'invalid_client_metadata', 'JSON object expected');
      const uris = body.redirect_uris;
      if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
        return oauthError(reply, 400, 'invalid_redirect_uri', 'redirect_uris must be a non-empty array (max 10)');
      }
      for (const u of uris) {
        if (typeof u !== 'string' || !isAllowedRedirectUri(u)) {
          return oauthError(reply, 400, 'invalid_redirect_uri', 'redirect_uris must be https (or http on localhost/127.0.0.1)');
        }
      }
      if (Array.isArray(body.grant_types) && !body.grant_types.includes('authorization_code')) {
        return oauthError(reply, 400, 'invalid_client_metadata', 'grant_types must include authorization_code');
      }
      if (Array.isArray(body.response_types) && !body.response_types.includes('code')) {
        return oauthError(reply, 400, 'invalid_client_metadata', 'response_types must include code');
      }
      const client: OAuthClient = { name: cleanName(body.client_name), redirectUris: [...new Set(uris as string[])], issuedAt: Math.floor(now() / 1000) };
      const clientId = signClientId(secret, client);
      if (clientId.length > MAX_CLIENT_ID_LEN) return oauthError(reply, 400, 'invalid_client_metadata', 'client metadata too large');
      return reply
        .code(201)
        .header('cache-control', 'no-store')
        .send({
          client_id: clientId,
          client_id_issued_at: client.issuedAt,
          client_name: client.name,
          redirect_uris: client.redirectUris,
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        });
    });

    // Authorization endpoint → SPA consent page.
    oauth.get('/oauth/authorize', async (req, reply) => {
      const q = (req.query ?? {}) as Record<string, unknown>;
      const check = checkAuthorize(secret, q, baseUrl(deps.config.publicUrl, req));
      if (!check.ok) {
        if (check.fatal) return oauthError(reply, 400, check.error, check.description);
        return reply.redirect(check.redirectTo, 302);
      }
      const p = check.p;
      const qs = new URLSearchParams();
      qs.set('response_type', 'code');
      qs.set('client_id', p.clientId);
      qs.set('redirect_uri', p.redirectUri);
      qs.set('code_challenge', p.codeChallenge);
      qs.set('code_challenge_method', 'S256');
      if (p.state !== null) qs.set('state', p.state);
      if (p.scope !== null) qs.set('scope', p.scope);
      if (p.resource !== null) qs.set('resource', p.resource);
      return reply.header('cache-control', 'no-store').redirect(`/connect?${qs.toString()}`, 302);
    });

    // Token endpoint: authorization_code + PKCE → raw API key.
    oauth.post('/oauth/token', async (req, reply) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : null);
      if (str('grant_type') !== 'authorization_code') return oauthError(reply, 400, 'unsupported_grant_type', 'Only authorization_code is supported');
      const code = str('code');
      const verifier = str('code_verifier');
      const clientId = str('client_id');
      const redirectUri = str('redirect_uri');
      if (!code || !verifier || !clientId || !redirectUri) {
        return oauthError(reply, 400, 'invalid_request', 'code, code_verifier, client_id and redirect_uri are required');
      }
      const taken = store.take(code);
      if (!taken) return oauthError(reply, 400, 'invalid_grant', 'Invalid or expired code');
      const { entry, replay } = taken;
      const burn = async (why: string) => {
        // Any failed or replayed redemption burns the code AND revokes the key minted for it.
        store.delete(code);
        await deps.services.apiKeys.revoke(entry.actor, entry.keyId).catch((err) => req.log.warn({ err }, 'oauth: key revoke failed'));
        return oauthError(reply, 400, 'invalid_grant', why);
      };
      if (replay) return burn('Code already used');
      if (now() >= entry.expiresAt) return burn('Code expired');
      if (!verifyClientId(secret, clientId) || !eq(clientId, entry.clientId)) return burn('client_id mismatch');
      if (!eq(redirectUri, entry.redirectUri)) return burn('redirect_uri mismatch');
      if (!PKCE_RE.test(verifier) || !eq(s256(verifier), entry.challenge)) return burn('PKCE verification failed');
      const raw = entry.raw;
      entry.raw = ''; // keep a tombstone (for replay detection) without the secret
      return reply
        .header('cache-control', 'no-store')
        .header('pragma', 'no-cache')
        .send({ access_token: raw, token_type: 'Bearer', scope: entry.scopes.join(' ') });
    });
  });
}

// ─── Session-authenticated consent API (mounted inside the /api auth scope) ──

export function oauthApiRoutes(deps: ServerDeps, store: CodeStore): RouteDef[] {
  const secret = deps.config.signingSecret;
  const now = () => (deps.clock ?? Date.now)();

  return [
    apiRoute({
      method: 'GET', path: '/api/oauth/client', operationId: 'oauthClientInfo', tag: 'OAuth', summary: 'Who is asking (consent page)',
      query: S.OAuthClientQuery, response: json(S.OAuthClientDto),
      handler: async ({ query }) => {
        const client = verifyClientId(secret, query.client_id);
        if (!client) throw new AppError('not_found', 'Unknown client');
        const uri = query.redirect_uri ?? client.redirectUris[0]!;
        if (!client.redirectUris.includes(uri)) throw new AppError('bad_request', 'redirect_uri is not registered for this client');
        return { name: client.name, host: new URL(uri).host, redirectUri: uri, redirectUris: client.redirectUris };
      },
    }),
    apiRoute({
      method: 'POST', path: '/api/oauth/approve', operationId: 'oauthApprove', tag: 'OAuth',
      summary: 'Approve/deny an OAuth connection (web session only); returns where to send the browser',
      body: S.OAuthApproveBody, response: json(z.object({ redirectTo: z.string() })),
      handler: async ({ actor, req, body }) => {
        if (actor.via !== 'session') throw new AppError('forbidden', 'OAuth approval requires a signed-in web session');
        const check = checkAuthorize(secret, body.query, baseUrl(deps.config.publicUrl, req));
        if (!check.ok) {
          if (check.fatal) throw new AppError('bad_request', check.description, { error: check.error });
          return { redirectTo: check.redirectTo };
        }
        const p = check.p;
        const iss = baseUrl(deps.config.publicUrl, req);
        if (!body.approve) {
          return { redirectTo: withParams(p.redirectUri, { error: 'access_denied', error_description: 'The user denied access', state: p.state, iss }) };
        }
        // Grant at most what the client asked for (when it asked in our scope vocabulary).
        const requested = (p.scope ?? '').split(/\s+/).filter((x): x is ApiScope => (SCOPES as string[]).includes(x));
        const scopes = requested.length ? body.scopes.filter((x) => requested.includes(x)) : [...new Set(body.scopes)];
        if (!scopes.length) {
          return { redirectTo: withParams(p.redirectUri, { error: 'invalid_scope', error_description: 'No grantable scope', state: p.state, iss }) };
        }
        if (body.actAs !== actor.memberId) {
          requireRole(actor, 'manager');
          const target = await deps.services.members.get(actor, body.actAs);
          if (target.kind !== 'agent') throw new AppError('forbidden', 'You can only connect as yourself or as an AI agent you manage');
        }
        const date = new Date(now()).toISOString().slice(0, 10);
        const { key, raw } = await deps.services.apiKeys.create(actor, {
          memberId: body.actAs,
          name: `${p.client.name} (connected ${date})`,
          scopes,
        });
        const code = store.put({ raw, keyId: key.id, actor, clientId: p.clientId, redirectUri: p.redirectUri, challenge: p.codeChallenge, scopes });
        return { redirectTo: withParams(p.redirectUri, { code, state: p.state, iss }) };
      },
    }),
  ];
}
