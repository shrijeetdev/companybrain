import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  Actor,
  AppServices,
  InboundMessage,
  IntegrationsStatus,
  OnInbound,
  Tts,
} from '@companybrain/types';

/** Mirrors `WhatsAppQr` from @companybrain/integrations (declared locally so the server only depends on types). */
export interface WhatsAppQrLike {
  start(): Promise<void>;
  logout(): Promise<void>;
  status(): { status: 'disconnected' | 'pairing' | 'connected'; qr: string | null; phone: string | null };
  send(to: string, text: string): Promise<boolean>;
}

/**
 * Meta WhatsApp Cloud webhook helpers, already bound to the integrations config.
 * The lead wires it as:
 *   { verifyChallenge: (q) => whatsappCloud.verifyChallenge(cfg, q),
 *     verifySignature: (raw, sig) => whatsappCloud.verifySignature(cfg, raw, sig),
 *     parse: (body) => whatsappCloud.parseWebhook(body) }
 * `null`/absent → the WhatsApp Cloud webhook is disabled (404).
 */
export interface WhatsAppWebhookHandlers {
  verifyChallenge(query: Record<string, string>): string | null;
  verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  parse(body: unknown): InboundMessage[];
}

/** Same signature as `handleMcpHttp` from @companybrain/mcp. */
export type McpHttpHandler = (
  services: AppServices,
  actor: Actor,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
) => Promise<void>;

export interface ServerDeps {
  services: AppServices;
  tts: Tts | null;
  integrations: {
    /** `IntegrationsConfig` from @companybrain/integrations — opaque to the server. */
    config: unknown;
    status(): IntegrationsStatus;
    whatsappQr: WhatsAppQrLike | null;
    onInbound: OnInbound;
    sendTest(actor: Actor, channel: 'whatsapp' | 'email' | 'push'): Promise<{ ok: boolean; error?: string }>;
    /** ADDITION to WIRING.md: bound `whatsappCloud` helpers (see WhatsAppWebhookHandlers). */
    whatsappWebhook?: WhatsAppWebhookHandlers | null;
    /** ADDITION to WIRING.md: `parseInboundEmailWebhook` from @companybrain/integrations. */
    parseEmailWebhook?: (body: unknown) => InboundMessage | null;
  };
  mcp: { handleHttp: McpHttpHandler };
  /** Optional clock (tests inject a fake one for OAuth code expiry). Default Date.now. */
  clock?: () => number;
  config: {
    version: string;
    publicUrl: string | null;
    webDir: string | null;
    /**
     * Reverse-proxy trust. `true` is treated as ONE trusted hop (see `normalizeTrustProxy`);
     * a number = hop count; a string = comma-separated trusted proxy IPs/CIDRs.
     */
    trustProxy: boolean | number | string;
    secureCookies: 'auto' | boolean;
    corsOrigins: string[];
    emailWebhookSecret: string | null;
    /** HMAC key for stateless OAuth client ids (ADDED by the OAuth contract update). */
    signingSecret: string;
    logLevel: string;
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved actor (null when unauthenticated). Set by the auth hook. */
    actor: Actor | null;
    /** Raw session token from the `cb_session` cookie, if the actor was resolved from it. */
    sessionToken: string | null;
  }
}
