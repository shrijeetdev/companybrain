import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Verify WhatsApp Cloud API webhook signature (X-Hub-Signature-256).
 * Returns true if the signature is valid, false otherwise.
 */
export function verifyWhatsAppSignature(
  body: string | Buffer,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Fastify preHandler hook for WhatsApp webhook signature verification.
 * Only activates when WHATSAPP_APP_SECRET is set.
 */
export function whatsappSignatureVerify() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) return; // Skip if not configured (dev mode)

    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      return reply.code(401).send({ error: 'Missing webhook signature' });
    }

    // Get raw body - Fastify should have this available
    const rawBody = JSON.stringify(req.body);
    if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
      return reply.code(403).send({ error: 'Invalid webhook signature' });
    }
  };
}

/**
 * Generic webhook signature verification for other channels.
 * Supports HMAC-SHA256 with configurable header name.
 */
export function genericWebhookVerify(options: {
  headerName?: string;
  secretEnvVar?: string;
} = {}) {
  const { headerName = 'x-webhook-signature', secretEnvVar } = options;

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = secretEnvVar ? process.env[secretEnvVar] : undefined;
    if (!secret) return; // Skip if not configured

    const signature = req.headers[headerName] as string | undefined;
    if (!signature) {
      return reply.code(401).send({ error: 'Missing webhook signature' });
    }

    const rawBody = JSON.stringify(req.body);
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
      if (!valid) {
        return reply.code(403).send({ error: 'Invalid webhook signature' });
      }
    } catch {
      return reply.code(403).send({ error: 'Invalid webhook signature' });
    }
  };
}
