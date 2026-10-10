// IMAP intake: poll a dedicated mailbox for UNSEEN mail, turn each into an InboundMessage,
// mark it seen, and send any reply back as a threaded email.

import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import type { InboundMessage, OnInbound } from '@companybrain/types';
import { extractAddress, type IntegrationsConfig } from '../config';
import { backoffMs, defaultLogger, errMsg, withTimeout, type Logger } from '../util';
import { createMailer, type Mailer } from './smtp';
import { bestBody } from './text';
import { authenticatedByHeader, MAX_AUTH_RESULTS, type EmailAuthOptions } from './auth';

export interface EmailPoller {
  start(): void;
  stop(): Promise<void>;
  /** Run one poll cycle; resolves to the number of messages handed to onInbound. */
  pollOnce(): Promise<number>;
}

/** The subset of ImapFlow we use (tests inject a fake). */
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  on?(event: 'error', cb: (err: unknown) => void): unknown;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: Record<string, unknown>, options?: { uid?: boolean }): Promise<number[] | false>;
  fetchOne(seq: string, query: Record<string, unknown>, options?: { uid?: boolean }): Promise<{ source?: Buffer } | false>;
  messageFlagsAdd(range: number[] | string, flags: string[], options?: { uid?: boolean }): Promise<boolean>;
}

export interface EmailPollerDeps {
  createClient?: () => ImapClientLike;
  mailer?: Mailer;
  log?: Logger;
  /** Max messages processed per cycle (default 50). */
  batchSize?: number;
}

function firstAddress(a: AddressObject | AddressObject[] | undefined): { address: string; name: string | null } | null {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  for (const obj of list) {
    for (const v of obj.value ?? []) {
      if (v.address) return { address: v.address.toLowerCase(), name: v.name?.trim() || null };
    }
  }
  return null;
}

function headerStr(mail: ParsedMail, name: string): string {
  const v = mail.headers?.get(name);
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value);
  return '';
}

/** Auto-replies, bounces and bulk mail must not create tasks (and must never get a reply → loops). */
export function isAutomated(mail: ParsedMail): boolean {
  const autoSubmitted = headerStr(mail, 'auto-submitted').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  const precedence = headerStr(mail, 'precedence').toLowerCase();
  if (/(bulk|junk|list|auto_reply)/.test(precedence)) return true;
  if (mail.headers?.has('x-autoreply') || mail.headers?.has('x-autorespond') || mail.headers?.has('list-id')) return true;
  const from = firstAddress(mail.from)?.address ?? '';
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i.test(from)) return true;
  return false;
}

/**
 * Value of the TOPMOST `Authentication-Results` header — the one prepended by the receiving
 * mailbox provider. Lower ones may have been written by the sender and are ignored.
 */
export function topmostAuthenticationResults(mail: ParsedMail): string | null {
  for (const h of mail.headerLines ?? []) {
    if (h.key !== 'authentication-results') continue;
    const line = h.line.slice(0, MAX_AUTH_RESULTS + 64);
    const colon = line.indexOf(':');
    return colon < 0 ? null : line.slice(colon + 1).trim();
  }
  return null;
}

/** Convert a parsed email into an InboundMessage (null if it has no usable sender/content). */
export function mailToInbound(mail: ParsedMail, fallbackId: string, auth: EmailAuthOptions = {}): InboundMessage | null {
  const from = firstAddress(mail.from);
  if (!from) return null;
  // Exactly one From address (multiple authors can't all be verified).
  const fromCount = (Array.isArray(mail.from) ? mail.from : mail.from ? [mail.from] : []).reduce((n, o) => n + (o.value?.length ?? 0), 0);
  const authenticated = !!auth.trustUnverifiedSenders || (fromCount === 1 && authenticatedByHeader(topmostAuthenticationResults(mail), from.address, auth));
  const subject = mail.subject?.slice(0, 1024).trim() || null;
  const text = bestBody(mail.text ?? null, typeof mail.html === 'string' ? mail.html : null) || subject || '';
  if (!text) return null;
  return {
    channel: 'email',
    from: from.address,
    fromName: from.name,
    subject,
    text,
    externalId: mail.messageId?.trim() || fallbackId,
    receivedAt: mail.date instanceof Date && Number.isFinite(mail.date.getTime()) ? mail.date.getTime() : Date.now(),
    authenticated,
  };
}

export function replySubject(subject: string | null): string {
  const s = (subject ?? '').trim();
  if (!s) return 'Re: your message';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function createEmailPoller(cfg: IntegrationsConfig, onInbound: OnInbound, deps: EmailPollerDeps = {}): EmailPoller | null {
  const imap = cfg.imap;
  if (!imap) return null;
  const log = deps.log ?? defaultLogger;
  const mailer = deps.mailer ?? createMailer(cfg, { log });
  const batchSize = deps.batchSize ?? 50;
  const ownAddresses = new Set(
    [imap.user, cfg.smtp ? extractAddress(cfg.smtp.from) : null].filter((x): x is string => !!x && x.includes('@')).map((x) => x.toLowerCase()),
  );
  const createClient =
    deps.createClient ??
    (() =>
      new ImapFlow({
        host: imap.host,
        port: imap.port,
        secure: imap.secure,
        auth: { user: imap.user, pass: imap.pass },
        logger: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 60_000,
      }) as unknown as ImapClientLike);

  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let inFlight: Promise<number> | null = null;
  let failures = 0;
  /** uid → handler failure count; give up (mark seen) after 3 to avoid poison-message loops. */
  const failedUids = new Map<number, number>();

  async function processOne(client: ImapClientLike, uid: number): Promise<boolean> {
    const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
    if (!msg || !msg.source) return false;
    const mail = await simpleParser(msg.source);
    const inbound = mailToInbound(mail, `imap:${imap!.user}:${imap!.mailbox}:${uid}`, cfg.emailAuth);
    const sender = inbound?.from ?? '';
    if (!inbound || isAutomated(mail) || ownAddresses.has(sender)) {
      await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
      return false;
    }
    let reply: string | null = null;
    try {
      reply = (await onInbound(inbound)).reply;
    } catch (e) {
      const n = (failedUids.get(uid) ?? 0) + 1;
      failedUids.set(uid, n);
      log.warn(`email: onInbound failed for uid ${uid} (attempt ${n}):`, errMsg(e));
      if (n < 3) return false; // leave UNSEEN, retry next cycle
    }
    failedUids.delete(uid);
    await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
    if (reply && mailer.configured) {
      const replyTo = firstAddress(mail.replyTo)?.address ?? sender;
      const refs = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [];
      const mid = mail.messageId?.trim();
      await mailer.send({
        to: replyTo,
        subject: replySubject(inbound.subject),
        text: reply,
        ...(mid ? { inReplyTo: mid, references: [...refs.filter((r) => r !== mid), mid] } : {}),
      });
    }
    return true;
  }

  async function doPoll(): Promise<number> {
    const client = createClient();
    client.on?.('error', (e) => log.warn('email: imap error:', errMsg(e)));
    let count = 0;
    try {
      await withTimeout(client.connect(), 20_000, 'imap connect');
      const lock = await withTimeout(client.getMailboxLock(imap!.mailbox), 10_000, 'imap select');
      try {
        const found = await client.search({ seen: false }, { uid: true });
        const uids = (found || []).slice(0, batchSize);
        for (const uid of uids) {
          try {
            if (await processOne(client, uid)) count++;
          } catch (e) {
            log.warn(`email: failed to process uid ${uid}:`, errMsg(e));
          }
        }
      } finally {
        lock.release();
      }
      try {
        await withTimeout(client.logout(), 5_000, 'imap logout');
      } catch {
        client.close();
      }
    } catch (e) {
      try {
        client.close();
      } catch {
        /* ignore */
      }
      throw e;
    }
    return count;
  }

  function pollOnce(): Promise<number> {
    if (inFlight) return inFlight;
    inFlight = doPoll().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function schedule(delayMs: number): void {
    if (!running) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await pollOnce();
        failures = 0;
        schedule(imap!.pollSeconds * 1000);
      } catch (e) {
        failures++;
        const delay = backoffMs(failures, imap!.pollSeconds * 1000, 15 * 60_000);
        log.warn(`email: poll failed (${errMsg(e)}); retrying in ${Math.round(delay / 1000)}s`);
        schedule(delay);
      }
    }, delayMs);
    timer.unref?.();
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule(1_000);
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      if (inFlight) await inFlight.catch(() => 0);
      if (!deps.mailer) mailer.close();
    },
    pollOnce,
  };
}
