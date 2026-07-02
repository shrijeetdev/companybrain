// Telegram integration — watches chats and creates loops from messages.
// Uses Telegram Bot API for webhook-based message handling.

import type { Channel } from '@companybrain/types';

export interface TelegramConfig {
  /** Bot token from BotFather */
  botToken: string;
  /** Webhook secret for verification */
  webhookSecret?: string;
}

export interface TelegramMessage {
  messageId: number;
  chatId: number;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  text: string;
  date: number;
  replyToMessageId?: number;
}

/**
 * Parse incoming Telegram update payload.
 */
export function parseTelegramUpdate(payload: any): TelegramMessage | null {
  const message = payload.message || payload.edited_message;
  if (!message) return null;

  return {
    messageId: message.message_id,
    chatId: message.chat.id,
    chatType: message.chat.type,
    userId: message.from?.id || 0,
    username: message.from?.username,
    firstName: message.from?.first_name,
    lastName: message.from?.last_name,
    text: message.text || message.caption || '',
    date: message.date,
    replyToMessageId: message.reply_to_message?.message_id,
  };
}

/**
 * Convert Telegram message to InboundMessage format.
 */
export function toInboundMessage(
  msg: TelegramMessage,
  orgId: string
): {
  orgId: string;
  channel: Channel;
  from: string;
  text: string;
  ref?: string;
} {
  const fromHandle = msg.username
    ? `@${msg.username}`
    : [msg.firstName, msg.lastName].filter(Boolean).join(' ') || `user_${msg.userId}`;

  return {
    orgId,
    channel: 'telegram',
    from: fromHandle,
    text: msg.text,
    ref: `tg:${msg.chatId}:${msg.messageId}`,
  };
}

/**
 * Send a message to a Telegram chat.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
      }),
    }
  );

  const data = await response.json() as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
}

/**
 * Reply to a message in Telegram.
 */
export async function replyToMessage(
  botToken: string,
  chatId: number,
  replyToMessageId: number,
  text: string
): Promise<void> {
  await sendTelegramMessage(botToken, chatId, text, replyToMessageId);
}

/**
 * Send a photo to a Telegram chat.
 */
export async function sendPhoto(
  botToken: string,
  chatId: number | string,
  photo: string,
  caption?: string
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo,
        caption,
      }),
    }
  );

  const data = await response.json() as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
}

/**
 * Send typing action to indicate bot is processing.
 */
export async function sendTypingAction(
  botToken: string,
  chatId: number | string
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing',
    }),
  });
}

/**
 * Set webhook URL for the bot.
 */
export async function setWebhook(
  botToken: string,
  url: string,
  secret?: string
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secret,
      }),
    }
  );

  const data = await response.json() as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
}

/**
 * Get bot info.
 */
export async function getBotInfo(
  botToken: string
): Promise<{ id: number; username: string; firstName: string }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = await response.json() as { ok: boolean; description?: string; result?: { id: number; username: string; first_name: string } };

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return {
    id: data.result?.id || 0,
    username: data.result?.username || '',
    firstName: data.result?.first_name || '',
  };
}
