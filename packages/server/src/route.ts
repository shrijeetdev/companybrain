// Tiny route-definition layer: one object drives zod validation, the Fastify route and the
// OpenAPI operation, so the docs can never drift from what the server accepts.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { Actor } from '@companybrain/types';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** What a route documents as its success response. */
export type ResponseDoc =
  | { kind: 'json'; schema: z.ZodType; status?: number }
  | { kind: 'empty' } // 204
  | { kind: 'binary'; mime: string; description: string; alsoEmpty?: boolean }
  | { kind: 'sse'; description: string }
  | { kind: 'raw'; mime: string; description: string };

export interface RouteDocInfo {
  method: Method;
  path: string; // Fastify syntax, e.g. /api/tasks/:id
  operationId: string;
  summary: string;
  description?: string;
  tag: string;
  auth: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: ResponseDoc;
}

export interface Ctx<A, P, Q, B> {
  actor: A;
  params: P;
  query: Q;
  body: B;
  req: FastifyRequest;
  reply: FastifyReply;
}

type Empty = Record<string, never>;
type Out<S, D> = S extends z.ZodType ? z.output<S> : D;

export interface RouteSpec<A, PS, QS, BS> extends Omit<RouteDocInfo, 'auth' | 'params' | 'query' | 'body'> {
  params?: PS;
  query?: QS;
  body?: BS;
  handler: (ctx: Ctx<A, Out<PS, Empty>, Out<QS, Empty>, Out<BS, undefined>>) => Promise<unknown>;
}

export interface RouteDef extends RouteDocInfo {
  handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
}

function build<A>(auth: boolean) {
  return function route<
    PS extends z.ZodType | undefined = undefined,
    QS extends z.ZodType | undefined = undefined,
    BS extends z.ZodType | undefined = undefined,
  >(spec: RouteSpec<A, PS, QS, BS>): RouteDef {
    const { handler, params: ps, query: qs, body: bs, ...doc } = spec;
    return {
      ...doc,
      auth,
      params: ps,
      query: qs,
      body: bs,
      async handler(req, reply) {
        const params = ps ? ps.parse(req.params ?? {}) : {};
        const query = qs ? qs.parse(req.query ?? {}) : {};
        // Empty bodies are valid: `{}` is assumed.
        const rawBody = req.body === undefined || req.body === null || req.body === '' ? {} : req.body;
        const body = bs ? bs.parse(rawBody) : undefined;
        const result = await handler({
          actor: req.actor as A,
          params: params as Out<PS, Empty>,
          query: query as Out<QS, Empty>,
          body: body as Out<BS, undefined>,
          req,
          reply,
        });
        if (reply.sent) return reply;
        if (doc.response.kind === 'empty') return reply.code(204).send();
        if (doc.response.kind === 'json' && doc.response.status) reply.code(doc.response.status);
        return result;
      },
    };
  };
}

/** Authenticated route — `ctx.actor` is always set. */
export const apiRoute = build<Actor>(true);
/** Public route — `ctx.actor` is whatever the optional identify step found (may be null). */
export const publicRoute = build<Actor | null>(false);

export function mount(app: FastifyInstance, defs: RouteDef[]) {
  for (const d of defs) {
    app.route({ method: d.method, url: d.path, handler: d.handler });
  }
}

export const json = (schema: z.ZodType, status?: number): ResponseDoc => ({ kind: 'json', schema, status });
export const empty: ResponseDoc = { kind: 'empty' };
