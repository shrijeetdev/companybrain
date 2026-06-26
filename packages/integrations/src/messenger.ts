// A channel-aware Messenger (the core port) backed by real integrations. The app builds
// this from env and injects it at bootstrap, so core's workers can actually reply.

import type { Messenger, OutboundMessage } from '@companybrain/core';
import { type WhatsAppConfig, sendText } from './whatsapp/cloud-api';

export interface MessengerConfig {
  whatsapp?: WhatsAppConfig;
}

export function createMessenger(cfg: MessengerConfig): Messenger {
  return {
    async send(msg: OutboundMessage) {
      switch (msg.channel) {
        case 'whatsapp':
          // Graceful degradation: the loop is already captured (never forgotten). If send-
          // credentials aren't set, log instead of throwing — no failed-job retry noise.
          if (!cfg.whatsapp) {
            console.log(`[messenger] WhatsApp send-credentials not set → would reply to ${msg.to}: ${msg.text}`);
            return;
          }
          await sendText(cfg.whatsapp, msg.to, msg.text);
          return;
        // email / slack / telegram fan in here as they're added.
        default:
          console.log(`[messenger] no sender wired for channel "${msg.channel}" → ${msg.to}: ${msg.text}`);
      }
    },
  };
}
