// OpenAPI 3.1 document generated from the same zod schemas the routes validate with.
import { z } from 'zod';
import type { RouteDocInfo } from './route';
import * as S from './schemas';

type Json = Record<string, unknown>;

const REF_PREFIX = '#/components/schemas/';

/** Definitions zod extracted that aren't registered DTOs (filled while building). */
let extraDefs: Json = {};
let ids: Set<string> | null = null;
const registeredIds = () => (ids ??= new Set(Object.keys(componentSchemas())));

function clean(schema: Json, extra?: Json): Json {
  const out = JSON.parse(JSON.stringify(schema).replaceAll('"#/$defs/', `"${REF_PREFIX}`)) as Json;
  const defs = out.$defs as Record<string, Json> | undefined;
  // Registered DTOs live in components already; keep any other extracted definitions too.
  if (defs && extra) for (const [k, v] of Object.entries(defs)) if (!(k in extra) && !registeredIds().has(k)) extra[k] = v;
  delete out.$schema;
  delete out.$defs;
  delete out.$id;
  return out;
}

function toSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  const id = S.docs.get(schema)?.id;
  if (id && io === 'output') return { $ref: `${REF_PREFIX}${id}` };
  const js = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
    // Refer to DTOs registered in S.docs instead of inlining them.
    metadata: S.docs,
    uri: (id: string) => `${REF_PREFIX}${id}`,
  } as Parameters<typeof z.toJSONSchema>[1]) as Json;
  return clean(js, extraDefs);
}

function componentSchemas(): Json {
  const all = z.toJSONSchema(S.docs, { uri: (id: string) => `${REF_PREFIX}${id}`, unrepresentable: 'any' }) as { schemas: Record<string, Json> };
  const out: Json = {};
  for (const [id, s] of Object.entries(all.schemas)) out[id] = clean(s);
  return out;
}

function objectShape(schema: z.ZodType | undefined): [string, z.ZodType][] {
  if (!schema) return [];
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape;
  return shape ? Object.entries(shape) : [];
}

function isOptional(s: z.ZodType): boolean {
  return s.safeParse(undefined).success;
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: `${REF_PREFIX}Error` } } },
});

export function buildOpenApi(routes: RouteDocInfo[], opts: { version: string; serverUrl: string }): Json {
  const paths: Record<string, Record<string, Json>> = {};
  extraDefs = {};
  for (const r of routes) {
    const oaPath = r.path.replace(/:([A-Za-z_]+)/g, '{$1}');
    const parameters: Json[] = [];
    for (const [name, s] of objectShape(r.params)) {
      parameters.push({ name, in: 'path', required: true, schema: toSchema(s, 'input') });
    }
    for (const [name, s] of objectShape(r.query)) {
      const schema = toSchema(s, 'input');
      parameters.push({
        name,
        in: 'query',
        required: !isOptional(s),
        schema,
        ...(name === 'status' ? { description: 'Comma-separated list', explode: false, style: 'form' } : {}),
      });
    }
    const op: Json = {
      operationId: r.operationId,
      summary: r.summary,
      tags: [r.tag],
      ...(r.description ? { description: r.description } : {}),
      ...(parameters.length ? { parameters } : {}),
      security: r.auth ? [{ bearerAuth: [] }] : [],
    };
    if (r.body) {
      op.requestBody = {
        required: !isOptional(r.body) && !(r.method === 'POST' && r.body.safeParse({}).success),
        content: { 'application/json': { schema: toSchema(r.body, 'input') } },
      };
    }
    const responses: Json = {};
    const resp = r.response;
    switch (resp.kind) {
      case 'json':
        responses[String(resp.status ?? 200)] = { description: 'OK', content: { 'application/json': { schema: toSchema(resp.schema, 'output') } } };
        break;
      case 'empty':
        responses['204'] = { description: 'No content' };
        break;
      case 'binary':
        responses['200'] = { description: resp.description, content: { [resp.mime]: { schema: { type: 'string', format: 'binary' } } } };
        if (resp.alsoEmpty) responses['204'] = { description: 'Not available' };
        break;
      case 'sse':
        responses['200'] = { description: resp.description, content: { 'text/event-stream': { schema: { type: 'string' } } } };
        break;
      case 'raw':
        responses['200'] = { description: resp.description, content: { [resp.mime]: { schema: { type: 'string' } } } };
        break;
    }
    responses['400'] = errorResponse('Invalid request');
    if (r.auth) {
      responses['401'] = errorResponse('Missing or invalid credentials');
      responses['403'] = errorResponse('Not allowed');
    }
    if (r.params) responses['404'] = errorResponse('Not found');
    responses['429'] = errorResponse('Rate limited');
    op.responses = responses;
    (paths[oaPath] ??= {})[r.method.toLowerCase()] = op;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'companybrain API',
      version: opts.version,
      description:
        'Task management for humans and AI agents. Authenticate with `Authorization: Bearer cb_live_…` ' +
        '(create a key in Settings → API keys). All times are epoch milliseconds (UTC). ' +
        'MCP clients should use the Streamable HTTP endpoint at `/mcp` instead.',
    },
    servers: [{ url: opts.serverUrl }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key (cb_live_…)' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'cb_session', description: 'Web session (browser only; mutations need X-CB-Client: web)' },
      },
      schemas: { ...extraDefs, ...componentSchemas() },
    },
  };
}
