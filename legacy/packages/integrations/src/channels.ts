// Channel factory — creates appropriate integrations based on environment.
// Centralizes all channel configuration and initialization.

import type { Channel } from '@companybrain/types';
import type { Core } from '@companybrain/core';
import { ingest, needsHuman, type InboundMessage } from './pipeline';
import { createMessenger, type MessengerConfig } from './messenger';
import { createGmailClient, getUnreadEmails, sendReply, type GmailConfig } from './email/gmail';
import { parseSlackEvent, toInboundMessage as slackToInbound, sendSlackMessage, type SlackConfig } from './slack';
import { parseTelegramUpdate, toInboundMessage as telegramToInbound, sendTelegramMessage, type TelegramConfig } from './telegram';
import { parseGitHubEvent, toInboundMessage as githubToInbound, createComment, verifyWebhookSignature, type GitHubConfig } from './github';
import { createCalendarClient, getUpcomingEvents, createEvent, type CalendarConfig } from './calendar';

export interface ChannelConfig {
  gmail?: GmailConfig;
  slack?: SlackConfig;
  telegram?: TelegramConfig;
  github?: GitHubConfig;
  calendar?: CalendarConfig;
}

export interface ChannelManager {
  /** Process inbound message from any channel */
  processInbound(channel: Channel, payload: any, orgId: string): Promise<string | null>;
  /** Send reply on a channel */
  sendReply(channel: Channel, to: string, text: string, ref?: string): Promise<void>;
  /** Get channel status */
  getChannelStatus(): Record<Channel, boolean>;
}

/**
 * Create a channel manager from environment variables.
 */
export function createChannelManager(config: ChannelConfig): ChannelManager {
  const messenger = createMessenger({
    whatsapp: undefined, // WhatsApp handled separately
  });

  return {
    async processInbound(channel: Channel, payload: any, orgId: string): Promise<string | null> {
      let inbound: InboundMessage | null = null;

      switch (channel) {
        case 'email':
          if (!config.gmail) throw new Error('Gmail not configured');
          // Email handled differently via polling
          return null;

        case 'slack':
          if (!config.slack) throw new Error('Slack not configured');
          const slackMsg = parseSlackEvent(payload);
          if (slackMsg) {
            inbound = slackToInbound(slackMsg, orgId);
          }
          break;

        case 'telegram':
          if (!config.telegram) throw new Error('Telegram not configured');
          const tgMsg = parseTelegramUpdate(payload);
          if (tgMsg) {
            inbound = telegramToInbound(tgMsg, orgId);
          }
          break;

        case 'github':
          if (!config.github) throw new Error('GitHub not configured');
          const eventType = payload.headers?.['x-github-event'] as string | undefined;
          const ghEvent = parseGitHubEvent(payload.body, eventType || '');
          if (ghEvent) {
            inbound = githubToInbound(ghEvent, orgId);
          }
          break;

        default:
          return null;
      }

      if (!inbound) return null;
      return await ingest(null as any, inbound); // Core instance passed separately
    },

    async sendReply(channel: Channel, to: string, text: string, ref?: string): Promise<void> {
      switch (channel) {
        case 'slack':
          if (!config.slack) throw new Error('Slack not configured');
          await sendSlackMessage(config.slack.botToken, to, text, ref);
          break;

        case 'telegram':
          if (!config.telegram) throw new Error('Telegram not configured');
          const chatId = parseInt(to, 10);
          if (isNaN(chatId)) throw new Error('Invalid Telegram chat ID');
          await sendTelegramMessage(config.telegram.botToken, chatId, text);
          break;

        case 'github':
          if (!config.github) throw new Error('GitHub not configured');
          // Parse repo/issue from ref
          if (ref) {
            const match = ref.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
            if (match && match[1] && match[2]) {
              const issueNumber = parseInt(match[2], 10);
              if (!isNaN(issueNumber)) {
                await createComment(config.github.token, match[1], issueNumber, text);
              }
            }
          }
          break;

        case 'email':
          if (!config.gmail) throw new Error('Gmail not configured');
          // Email replies handled separately
          break;

        default:
          console.log(`[channels] No sender for ${channel}`);
      }
    },

    getChannelStatus(): Record<Channel, boolean> {
      return {
        whatsapp: true, // Handled separately
        email: !!config.gmail,
        slack: !!config.slack,
        telegram: !!config.telegram,
        github: !!config.github,
        calendar: !!config.calendar,
        manual: true, // Always available
      };
    },
  };
}

/**
 * Load channel config from environment variables.
 */
export function loadChannelConfig(): ChannelConfig {
  const config: ChannelConfig = {};

  // Gmail
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN) {
    config.gmail = {
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
      redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/gmail/callback',
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      emailAddress: process.env.GMAIL_ADDRESS || '',
    };
  }

  // Slack
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    config.slack = {
      botToken: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    };
  }

  // Telegram
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    };
  }

  // GitHub
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_WEBHOOK_SECRET) {
    config.github = {
      token: process.env.GITHUB_TOKEN,
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    };
  }

  // Google Calendar
  if (process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
    config.calendar = {
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/auth/calendar/callback',
      refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    };
  }

  return config;
}
