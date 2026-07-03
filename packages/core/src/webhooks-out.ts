// Webhooks Out service — register outbound webhook URLs, fire on events.

import { newId } from './context';
import type { Context } from './context';

export interface WebhookConfig {
  id: string;
  orgId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: number;
}

export function makeWebhooksOut(ctx: Context) {
  const webhooks = new Map<string, WebhookConfig>();

  async function register(orgId: string, url: string, events: string[]): Promise<WebhookConfig> {
    const wh: WebhookConfig = {
      id: newId('wh'),
      orgId,
      url,
      events,
      secret: `whsec_${newId('sec')}`,
      active: true,
      createdAt: Date.now(),
    };
    webhooks.set(wh.id, wh);
    return wh;
  }

  async function list(orgId: string): Promise<Omit<WebhookConfig, 'secret'>[]> {
    return [...webhooks.values()]
      .filter(w => w.orgId === orgId)
      .map(({ secret, ...rest }) => rest);
  }

  async function remove(id: string): Promise<void> {
    webhooks.delete(id);
  }

  async function fire(event: string, payload: Record<string, unknown>, orgId?: string): Promise<void> {
    const targets = [...webhooks.values()].filter(w => {
      if (!w.active) return false;
      if (orgId && w.orgId !== orgId) return false;
      return w.events.includes('*') || w.events.includes(event);
    });

    for (const wh of targets) {
      try {
        const { createHmac } = await import('node:crypto');
        const signature = createHmac('sha256', wh.secret)
          .update(JSON.stringify(payload))
          .digest('hex');

        await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event,
          },
          body: JSON.stringify({ event, payload, timestamp: Date.now() }),
        });
      } catch (err) {
        console.error('[webhooks] delivery failed', wh.id, err);
      }
    }
  }

  return { register, list, remove, fire };
}

export type WebhooksOutService = ReturnType<typeof makeWebhooksOut>;
