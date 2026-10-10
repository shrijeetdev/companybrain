// Web Push (VAPID): key management + sending.

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import type { IntegrationsConfig } from './config';
import { defaultLogger, errMsg, type Logger } from './util';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const cache = new Map<string, VapidKeys>();

const isB64Url = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(s);

/**
 * VAPID keys: from env (VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY), else read `<dataDir>/vapid.json`,
 * else generate once and persist there with mode 0600.
 */
export function getVapidKeys(cfg: IntegrationsConfig): VapidKeys {
  if (cfg.vapid.publicKey && cfg.vapid.privateKey) {
    return { publicKey: cfg.vapid.publicKey, privateKey: cfg.vapid.privateKey };
  }
  const file = join(cfg.dataDir, 'vapid.json');
  const cached = cache.get(file);
  if (cached) return cached;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<VapidKeys>;
    if (isB64Url(parsed.publicKey) && isB64Url(parsed.privateKey)) {
      const keys = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
      cache.set(file, keys);
      return keys;
    }
  } catch {
    /* not there yet (or unreadable) → generate */
  }
  const keys = webpush.generateVAPIDKeys();
  mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best effort on exotic filesystems */
  }
  cache.set(file, keys);
  return keys;
}

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export interface PushSender {
  (sub: PushSub, payload: string, options: Record<string, unknown>): Promise<unknown>;
}

/** Send one notification. 404/410 from the push service → 'gone' (delete the subscription). */
export async function sendPush(
  keys: VapidKeys,
  subject: string,
  sub: PushSub,
  payload: PushPayload,
  deps: { send?: PushSender; log?: Logger } = {},
): Promise<'sent' | 'gone' | 'failed'> {
  const log = deps.log ?? defaultLogger;
  const send: PushSender = deps.send ?? ((s, p, o) => webpush.sendNotification(s, p, o));
  try {
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return 'gone';
    await send(sub, JSON.stringify(payload), {
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 24 * 60 * 60,
      urgency: 'normal',
      timeout: 10_000,
      ...(payload.tag ? { topic: topicFromTag(payload.tag) } : {}),
    });
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return 'gone';
    log.warn(`push: send failed${status ? ` (HTTP ${status})` : ''}:`, errMsg(e));
    return 'failed';
  }
}

/** Push "Topic" header must be ≤32 URL-safe base64 chars. */
function topicFromTag(tag: string): string | undefined {
  const t = tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return t || undefined;
}
