// WhatsApp via QR pairing (Baileys v7, WhatsApp Web protocol). Optional dependency, loaded
// lazily with dynamic import() only when start() is called, so the app runs without it.
//
// Everything Baileys does is wrapped: no Baileys error may crash the process.

import { mkdir, rm } from 'node:fs/promises';
import QRCode from 'qrcode';
import type { InboundMessage, OnInbound } from '@companybrain/types';
import type { IntegrationsConfig } from '../config';
import { backoffMs, defaultLogger, errMsg, normalizePhone, withTimeout, type Logger } from '../util';

export interface WhatsAppQr {
  start(): Promise<void>;
  logout(): Promise<void>;
  status(): { status: 'disconnected' | 'pairing' | 'connected'; qr: string | null; phone: string | null };
  send(to: string, text: string): Promise<boolean>;
  /** Close the socket without clearing the session (graceful shutdown). */
  stop(): Promise<void>;
}

// ── Minimal structural view of the Baileys surface we use (keeps us decoupled from its types) ──
interface BMessageKey {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  fromMe?: boolean | null;
  id?: string | null;
  participant?: string | null;
}
interface BMessage {
  key: BMessageKey;
  message?: Record<string, any> | null;
  pushName?: string | null;
  messageTimestamp?: number | { toNumber(): number } | null;
}
interface BSocket {
  ev: { on(event: string, cb: (arg: any) => void): void; removeAllListeners?(event: string): void };
  user?: { id?: string } | null;
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  logout(msg?: string): Promise<void>;
  end(err?: Error): void;
}
export interface BaileysModuleLike {
  default?: unknown;
  makeWASocket?: unknown;
  useMultiFileAuthState(folder: string): Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
  fetchLatestBaileysVersion?: (opts?: RequestInit) => Promise<{ version: number[] }>;
  DisconnectReason?: { loggedOut?: number; restartRequired?: number; connectionReplaced?: number };
  Browsers?: { appropriate?(browser: string): unknown };
}

/** Pino-compatible silent logger so Baileys doesn't spam stdout. */
function silentLogger(): any {
  const l: any = { level: 'silent' };
  for (const k of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) l[k] = () => {};
  l.child = () => l;
  return l;
}

const TEXT_KEYS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'editedMessage'];

/** Pull user-visible text out of a (possibly wrapped) Baileys message. */
export function extractBaileysText(message: Record<string, any> | null | undefined, depth = 0): string | null {
  if (!message || depth > 3) return null;
  for (const k of TEXT_KEYS) {
    if (message[k]?.message) return extractBaileysText(message[k].message, depth + 1);
  }
  const t =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    message.templateButtonReplyMessage?.selectedDisplayText ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    null;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

/** Map an incoming Baileys message to an InboundMessage, or null if it should be ignored. */
export function baileysToInbound(m: BMessage): InboundMessage | null {
  const key = m?.key;
  if (!key || key.fromMe || !m.message) return null;
  const jid = key.remoteJid ?? '';
  if (!jid) return null;
  // Ignore groups, broadcast lists, status updates and newsletters/channels.
  if (/@(g\.us|broadcast|newsletter)$/.test(jid) || jid === 'status@broadcast') return null;
  const text = extractBaileysText(m.message);
  if (!text) return null;
  // Baileys v7 may address 1:1 chats by LID (xxx@lid); the phone JID is then in remoteJidAlt.
  const phone = normalizePhone(jid) ?? normalizePhone(key.remoteJidAlt ?? null);
  const ts = m.messageTimestamp;
  const tsNum = typeof ts === 'number' ? ts : ts && typeof ts === 'object' && 'toNumber' in ts ? ts.toNumber() : Number(ts);
  return {
    channel: 'whatsapp',
    from: phone ?? jid,
    fromName: m.pushName ?? null,
    subject: null,
    text,
    externalId: key.id ?? `${jid}:${tsNum}`,
    receivedAt: Number.isFinite(tsNum) && tsNum > 0 ? tsNum * 1000 : Date.now(),
  };
}

export interface WhatsAppQrDeps {
  /** Override module loading (tests). Default: dynamic import('@whiskeysockets/baileys'). */
  loadBaileys?: () => Promise<BaileysModuleLike>;
  log?: Logger;
}

export function createWhatsAppQr(cfg: IntegrationsConfig, onInbound: OnInbound, deps: WhatsAppQrDeps = {}): WhatsAppQr {
  const log = deps.log ?? defaultLogger;
  const authDir = cfg.whatsapp.authDir;
  const load =
    deps.loadBaileys ??
    (async () => {
      const spec = '@whiskeysockets/baileys';
      return (await import(spec)) as BaileysModuleLike;
    });

  let sock: BSocket | null = null;
  let state: 'disconnected' | 'pairing' | 'connected' = 'disconnected';
  let qr: string | null = null;
  let phone: string | null = null;
  let running = false; // start() called and not stopped/logged out
  let connecting = false;
  let attempts = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let generation = 0; // invalidates handlers of superseded sockets

  function clearTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function closeSocket(): void {
    const s = sock;
    sock = null;
    if (!s) return;
    try {
      s.end(undefined);
    } catch {
      /* best effort */
    }
  }

  function scheduleReconnect(immediate: boolean): void {
    if (!running) return;
    clearTimer();
    const delay = immediate ? 500 : backoffMs(attempts, 2_000, 5 * 60_000);
    attempts++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
    reconnectTimer.unref?.();
  }

  async function handleMessage(s: BSocket, m: BMessage): Promise<void> {
    const msg = baileysToInbound(m);
    if (!msg) return;
    try {
      const { reply } = await onInbound(msg);
      if (reply && sock === s && state === 'connected' && m.key.remoteJid) {
        await withTimeout(s.sendMessage(m.key.remoteJid, { text: reply }), 10_000, 'whatsapp reply');
      }
    } catch (e) {
      log.warn('whatsapp qr: inbound handling failed:', errMsg(e));
    }
  }

  async function connect(): Promise<void> {
    if (!running || connecting) return;
    connecting = true;
    const myGen = ++generation;
    try {
      let mod: BaileysModuleLike;
      try {
        mod = await load();
      } catch (e) {
        log.warn('whatsapp qr: @whiskeysockets/baileys is not installed — QR mode unavailable', errMsg(e));
        running = false;
        state = 'disconnected';
        return;
      }
      const makeSocket = (typeof mod.makeWASocket === 'function' ? mod.makeWASocket : mod.default) as
        | ((opts: Record<string, unknown>) => BSocket)
        | undefined;
      if (typeof makeSocket !== 'function') throw new Error('baileys: makeWASocket not found');

      await mkdir(authDir, { recursive: true, mode: 0o700 });
      const { state: authState, saveCreds } = await mod.useMultiFileAuthState(authDir);

      let version: number[] | undefined;
      try {
        if (mod.fetchLatestBaileysVersion) {
          version = (await withTimeout(mod.fetchLatestBaileysVersion({ signal: AbortSignal.timeout(10_000) }), 10_000, 'baileys version')).version;
        }
      } catch {
        version = undefined; // fall back to the bundled default
      }

      closeSocket();
      const s = makeSocket({
        ...(version ? { version } : {}),
        auth: authState,
        logger: silentLogger(),
        browser: mod.Browsers?.appropriate?.('Chrome') ?? ['companybrain', 'Chrome', '1.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 20_000,
      });
      sock = s;
      const loggedOutCode = mod.DisconnectReason?.loggedOut ?? 401;
      const restartCode = mod.DisconnectReason?.restartRequired ?? 515;

      s.ev.on('creds.update', () => {
        saveCreds().catch((e) => log.warn('whatsapp qr: saving creds failed:', errMsg(e)));
      });

      s.ev.on('connection.update', (u: any) => {
        if (myGen !== generation) return;
        try {
          if (u?.qr) {
            state = 'pairing';
            QRCode.toDataURL(String(u.qr), { margin: 1, width: 320 })
              .then((url) => {
                if (myGen === generation && state === 'pairing') qr = url;
              })
              .catch((e) => log.warn('whatsapp qr: QR render failed:', errMsg(e)));
          }
          if (u?.connection === 'open') {
            state = 'connected';
            qr = null;
            attempts = 0;
            const id = s.user?.id ?? '';
            phone = normalizePhone(id.replace(/:\d+@/, '@')) ?? normalizePhone(id.split('@')[0]?.split(':')[0] ?? null);
            log.info('whatsapp qr: connected', phone ?? '');
          }
          if (u?.connection === 'close') {
            const code = u?.lastDisconnect?.error?.output?.statusCode ?? u?.lastDisconnect?.error?.statusCode;
            if (sock === s) sock = null;
            qr = null;
            if (code === loggedOutCode) {
              log.warn('whatsapp qr: logged out from phone — clearing session; call start() to pair again');
              state = 'disconnected';
              phone = null;
              running = false;
              clearTimer();
              rm(authDir, { recursive: true, force: true }).catch(() => {});
              return;
            }
            state = 'disconnected';
            if (running) {
              log.warn(`whatsapp qr: connection closed (code=${code ?? '?'}), reconnecting`);
              scheduleReconnect(code === restartCode);
            }
          }
        } catch (e) {
          log.warn('whatsapp qr: connection.update handler error:', errMsg(e));
        }
      });

      s.ev.on('messages.upsert', (ev: any) => {
        if (myGen !== generation) return;
        try {
          if (ev?.type !== 'notify' || !Array.isArray(ev.messages)) return;
          for (const m of ev.messages as BMessage[]) void handleMessage(s, m);
        } catch (e) {
          log.warn('whatsapp qr: messages.upsert handler error:', errMsg(e));
        }
      });
    } catch (e) {
      log.warn('whatsapp qr: connect failed:', errMsg(e));
      state = 'disconnected';
      scheduleReconnect(false);
    } finally {
      connecting = false;
    }
  }

  return {
    async start() {
      if (running) return;
      running = true;
      attempts = 0;
      await connect();
    },
    async stop() {
      running = false;
      clearTimer();
      generation++;
      closeSocket();
      state = 'disconnected';
      qr = null;
    },
    async logout() {
      running = false;
      clearTimer();
      const s = sock;
      generation++;
      if (s) {
        try {
          await withTimeout(s.logout(), 10_000, 'whatsapp logout');
        } catch (e) {
          log.warn('whatsapp qr: logout error (clearing session anyway):', errMsg(e));
        }
      }
      closeSocket();
      state = 'disconnected';
      qr = null;
      phone = null;
      try {
        await rm(authDir, { recursive: true, force: true });
      } catch (e) {
        log.warn('whatsapp qr: could not clear auth dir:', errMsg(e));
      }
    },
    status() {
      return { status: state, qr: state === 'pairing' ? qr : null, phone: state === 'connected' ? phone : null };
    },
    async send(to, text) {
      const s = sock;
      if (!s || state !== 'connected') return false;
      const p = normalizePhone(to);
      if (!p) {
        log.warn('whatsapp qr: invalid phone number', to);
        return false;
      }
      try {
        await withTimeout(s.sendMessage(`${p.slice(1)}@s.whatsapp.net`, { text }), 10_000, 'whatsapp send');
        return true;
      } catch (e) {
        log.warn('whatsapp qr: send failed:', errMsg(e));
        return false;
      }
    },
  };
}
