// WhatsApp via Baileys (WhatsApp Web protocol) — the QR-pairing path. No Meta app, no
// Cloud API, no public webhook: a persistent socket connects out, receives inbound
// messages, and sends replies on the same connection. Pair once by scanning a QR.
//
// Inbound funnels through the SAME `ingest()` pipeline as every other channel; outbound
// is exposed as a core Messenger so the reply/chase workers can talk back over WhatsApp.

import { homedir } from 'node:os';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import baileysPkg, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';

// Baileys ships as CJS; the factory lives on `.default` under ESM interop.
const makeWASocket = ((baileysPkg as any)?.default ?? baileysPkg) as typeof import('@whiskeysockets/baileys').default;
import type { Core, Messenger, OutboundMessage } from '@companybrain/core';
import { ingest } from '../pipeline';

// Baileys wants a pino-like logger; this silent stub avoids pulling pino into our code.
const silentLogger: any = {
  level: 'silent',
  child: () => silentLogger,
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
};

const toJid = (to: string): string => (to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`);
const numberFromJid = (jid: string): string => jid.split('@')[0] ?? jid;

export interface BaileysChannel {
  /** core injects this so reply/chase jobs can send over WhatsApp */
  messenger: Messenger;
  /** open the socket; prints a QR to scan on first run, then persists the session */
  start(core: Core): Promise<void>;
  stop(): Promise<void>;
}

export function createBaileysChannel(opts: { orgId: string; authDir?: string }): BaileysChannel {
  let sock: WASocket | null = null;
  const authDir = opts.authDir ?? join(homedir(), '.companybrain', 'wa');

  const messenger: Messenger = {
    async send(msg: OutboundMessage) {
      if (msg.channel !== 'whatsapp') {
        console.log(`[baileys] no sender wired for channel "${msg.channel}" → ${msg.to}`);
        return;
      }
      if (!sock) throw new Error('WhatsApp socket not connected yet (scan the QR first)');
      await sock.sendMessage(toJid(msg.to), { text: msg.text });
    },
  };

  async function start(core: Core): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false, browser: ['companybrain', 'Chrome', '1.0'] });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        console.log('\n[whatsapp] open WhatsApp → Settings → Linked devices → Link a device, then scan:\n');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') console.log('[whatsapp] connected ✓');
      if (connection === 'close') {
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log(`[whatsapp] connection closed${loggedOut ? ' (logged out — delete ~/.companybrain/wa to re-pair)' : ' — reconnecting…'}`);
        if (!loggedOut) void start(core).catch((e) => console.error('[whatsapp] reconnect failed:', e));
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        if (m.key.fromMe || !m.message) continue;
        const text = m.message.conversation ?? m.message.extendedTextMessage?.text ?? '';
        if (!text) continue;
        const from = numberFromJid(m.key.remoteJid ?? '');
        await ingest(core, { orgId: opts.orgId, channel: 'whatsapp', from, text, ref: m.key.id ?? undefined });
      }
    });
  }

  async function stop(): Promise<void> {
    try {
      sock?.end(undefined as unknown as Error);
    } catch {
      /* best effort */
    }
    sock = null;
  }

  return { messenger, start, stop };
}
