// Outbound port implementation: WhatsApp (QR socket or Cloud API), email (SMTP), Web Push.
// Never throws: every failure is logged and reported as false / 'failed'.

import type { Outbound } from '@companybrain/types';
import type { IntegrationsConfig } from './config';
import { createMailer, type MailTransport } from './email/smtp';
import { getVapidKeys, sendPush, type PushSender, type VapidKeys } from './push';
import { defaultLogger, errMsg, type FetchLike, type Logger } from './util';
import { sendCloudText } from './whatsapp/cloud';
import type { WhatsAppQr } from './whatsapp/qr';

export interface OutboundDeps {
  fetch?: FetchLike;
  mailTransport?: MailTransport;
  pushSend?: PushSender;
  log?: Logger;
}

export function createOutbound(cfg: IntegrationsConfig, qr?: WhatsAppQr | null, deps: OutboundDeps = {}): Outbound {
  const log = deps.log ?? defaultLogger;
  const mailer = createMailer(cfg, { transport: deps.mailTransport, log });
  let vapid: VapidKeys | null | undefined;

  function keys(): VapidKeys | null {
    if (vapid === undefined) {
      try {
        vapid = getVapidKeys(cfg);
      } catch (e) {
        log.warn('push: VAPID keys unavailable:', errMsg(e));
        vapid = null;
      }
    }
    return vapid;
  }

  function qrConnected(): boolean {
    try {
      return qr?.status().status === 'connected';
    } catch {
      return false;
    }
  }

  return {
    async whatsapp(to, text) {
      try {
        if (!text?.trim()) return false;
        if (qr && qrConnected()) {
          if (await qr.send(to, text)) return true;
          // fall through to Cloud API if it's also configured
        }
        if (cfg.whatsapp.cloudConfigured) return await sendCloudText(cfg, to, text, { fetch: deps.fetch, log });
        return false;
      } catch (e) {
        log.warn('whatsapp: send error:', errMsg(e));
        return false;
      }
    },
    async email(to, subject, text, html) {
      try {
        return await mailer.send({ to, subject, text, ...(html ? { html } : {}) });
      } catch (e) {
        log.warn('email: send error:', errMsg(e));
        return false;
      }
    },
    async push(sub, payload) {
      try {
        const k = keys();
        if (!k) return 'failed';
        return await sendPush(k, cfg.vapid.subject, sub, payload, { send: deps.pushSend, log });
      } catch (e) {
        log.warn('push: send error:', errMsg(e));
        return 'failed';
      }
    },
    status() {
      return {
        whatsapp: cfg.whatsapp.cloudConfigured || qrConnected(),
        email: mailer.configured,
        push: keys() !== null,
      };
    },
  };
}
