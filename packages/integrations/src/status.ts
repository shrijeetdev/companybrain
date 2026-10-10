import type { IntegrationsStatus } from '@companybrain/types';
import { extractAddress, type IntegrationsConfig } from './config';
import type { WhatsAppQr } from './whatsapp/qr';

/** Shape of GET /api/integrations (the server adds mcpUrl). Never throws. */
export function integrationsStatus(cfg: IntegrationsConfig, qr?: WhatsAppQr | null): IntegrationsStatus {
  let qrState: ReturnType<WhatsAppQr['status']> | null = null;
  try {
    qrState = qr ? qr.status() : null;
  } catch {
    qrState = null;
  }
  const qrConnected = qrState?.status === 'connected';
  const mode: IntegrationsStatus['whatsapp']['mode'] = qrConnected
    ? 'qr'
    : cfg.whatsapp.cloudConfigured
      ? 'cloud'
      : qr || cfg.whatsapp.qrEnabled
        ? 'qr'
        : null;
  return {
    whatsapp: {
      mode,
      connected: qrConnected || cfg.whatsapp.cloudConfigured,
      phone: qrConnected ? (qrState?.phone ?? null) : null,
    },
    email: {
      inbound: cfg.imap !== null,
      outbound: cfg.smtp !== null,
      address: cfg.imap?.user.includes('@') ? cfg.imap.user : cfg.smtp ? extractAddress(cfg.smtp.from) : null,
    },
    push: true, // VAPID keys are always available (env or generated on first use)
    llm: { provider: cfg.llm?.provider ?? null },
    tts: { provider: cfg.tts?.provider ?? null },
  };
}
