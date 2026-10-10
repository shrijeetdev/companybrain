// Public routes: health, auth (state/setup/login/logout).
import { z } from 'zod';
import { AppError } from '@companybrain/types';
import type { FastifyRequest } from 'fastify';
import type { ServerDeps } from '../types';
import { publicRoute as r, json, type RouteDef } from '../route';
import { checkCsrf } from '../auth';
import { clearSessionCookie, isSecureRequest, readCookie, SESSION_COOKIE, sessionCookie } from '../http';
import * as S from '../schemas';

export interface PublicRouteOpts {
  /** Strict limiter for login/setup (10/min per IP+identifier) — called with the identifier on `req`. */
  authLimit: (req: FastifyRequest, identifier: string, reply: import('fastify').FastifyReply) => Promise<void>;
  identify: (req: FastifyRequest) => Promise<void>;
}

const startedAt = Date.now();

export function publicRoutes(deps: ServerDeps, opts: PublicRouteOpts): RouteDef[] {
  const s = deps.services;
  const now = () => (deps.clock ?? Date.now)();

  return [
    r({
      method: 'GET', path: '/health', operationId: 'health', tag: 'Meta', summary: 'Liveness probe',
      response: json(z.object({ ok: z.boolean(), version: z.string(), uptime: z.number().describe('seconds') })),
      handler: async ({ reply }) => {
        reply.header('cache-control', 'no-store');
        return { ok: true, version: deps.config.version, uptime: Math.round((Date.now() - startedAt) / 1000) };
      },
    }),
    r({
      method: 'GET', path: '/api/auth/state', operationId: 'authState', tag: 'Auth', summary: 'Setup/session state for the web app',
      response: json(
        z.object({ needsSetup: z.boolean(), authenticated: z.boolean(), member: S.MemberDto.optional(), org: S.OrgDto.optional() }),
      ),
      handler: async ({ req, reply }) => {
        reply.header('cache-control', 'no-store');
        const needsSetup = await s.auth.needsSetup();
        await opts.identify(req);
        const actor = req.actor;
        if (!actor) return { needsSetup, authenticated: false };
        const [member, org] = await Promise.all([s.members.me(actor), s.org.get(actor)]);
        return { needsSetup, authenticated: true, member, org };
      },
    }),
    r({
      method: 'POST', path: '/api/auth/setup', operationId: 'setup', tag: 'Auth', summary: 'First-run: create the org and owner account',
      body: S.SetupBody, response: json(z.object({ member: S.MemberDto })),
      handler: async ({ req, reply, body }) => {
        await opts.authLimit(req, body.email, reply);
        if (!(await s.auth.needsSetup())) throw new AppError('conflict', 'Already set up');
        const res = await s.auth.setup(body);
        reply.header('set-cookie', sessionCookie(res.token, res.expiresAt, isSecureRequest(req, deps.config.secureCookies), now()));
        reply.header('cache-control', 'no-store');
        return { member: res.member };
      },
    }),
    r({
      method: 'POST', path: '/api/auth/login', operationId: 'login', tag: 'Auth', summary: 'Email/password login (sets the session cookie)',
      body: S.LoginBody, response: json(z.object({ member: S.MemberDto })),
      handler: async ({ req, reply, body }) => {
        await opts.authLimit(req, body.identifier, reply);
        const res = await s.auth.login(body.identifier, body.password, {
          ip: req.ip,
          userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
        });
        // Session rotation: drop any previous session presented by this browser.
        const old = readCookie(req, SESSION_COOKIE);
        if (old && old !== res.token && old.length <= 512) await s.auth.logout(old).catch(() => undefined);
        reply.header('set-cookie', sessionCookie(res.token, res.expiresAt, isSecureRequest(req, deps.config.secureCookies), now()));
        reply.header('cache-control', 'no-store');
        return { member: res.member };
      },
    }),
    r({
      method: 'POST', path: '/api/auth/logout', operationId: 'logout', tag: 'Auth', summary: 'End the session and clear the cookie',
      response: json(S.OkDto),
      handler: async ({ req, reply }) => {
        const token = readCookie(req, SESSION_COOKIE);
        if (token) {
          // Cookie-authenticated mutation → CSRF header required.
          checkCsrf(req);
          if (token.length <= 512) await s.auth.logout(token);
        }
        reply.header('set-cookie', clearSessionCookie(isSecureRequest(req, deps.config.secureCookies)));
        return { ok: true };
      },
    }),
  ];
}
