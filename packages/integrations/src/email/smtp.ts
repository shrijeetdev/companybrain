// SMTP outbound via nodemailer (pooled transport, created lazily).

import nodemailer from 'nodemailer';
import type { IntegrationsConfig } from '../config';
import { defaultLogger, errMsg, withTimeout, type Logger } from '../util';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

/** Minimal transport surface (nodemailer Transporter satisfies it; tests inject fakes). */
export interface MailTransport {
  sendMail(msg: Record<string, unknown>): Promise<unknown>;
  close?(): void;
}

export interface Mailer {
  configured: boolean;
  send(msg: MailMessage): Promise<boolean>;
  close(): void;
}

export function createMailer(cfg: IntegrationsConfig, deps: { transport?: MailTransport; log?: Logger } = {}): Mailer {
  const log = deps.log ?? defaultLogger;
  const smtp = cfg.smtp;
  let transport: MailTransport | null = deps.transport ?? null;

  function getTransport(): MailTransport | null {
    if (!smtp) return null;
    if (!transport) {
      transport = nodemailer.createTransport({
        pool: true,
        maxConnections: 3,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass ?? '' } } : {}),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }) as unknown as MailTransport;
    }
    return transport;
  }

  return {
    configured: Boolean(smtp),
    async send(msg) {
      const t = getTransport();
      if (!t || !smtp) return false;
      if (!msg.to || !/@/.test(msg.to)) {
        log.warn('email: invalid recipient', msg.to);
        return false;
      }
      try {
        await withTimeout(
          t.sendMail({
            from: smtp.from,
            to: msg.to,
            subject: msg.subject,
            text: msg.text,
            ...(msg.html ? { html: msg.html } : {}),
            ...(msg.inReplyTo ? { inReplyTo: msg.inReplyTo } : {}),
            ...(msg.references?.length ? { references: msg.references } : {}),
          }),
          15_000,
          'smtp send',
        );
        return true;
      } catch (e) {
        log.warn('email: send failed:', errMsg(e));
        return false;
      }
    },
    close() {
      try {
        transport?.close?.();
      } catch {
        /* ignore */
      }
      transport = null;
    },
  };
}
