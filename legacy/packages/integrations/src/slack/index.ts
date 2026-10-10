// Slack integration — watches channels and creates loops from messages.
// Uses Slack Bolt for WebSocket connection and event handling.

import type { Channel } from '@companybrain/types';
import type { Core } from '@companybrain/core';

export interface SlackConfig {
  /** Bot token (xoxb-...) */
  botToken: string;
  /** App token (xapp-...) for Socket Mode */
  appToken: string;
  /** Signing secret for webhook verification */
  signingSecret: string;
}

export interface SlackMessage {
  channel: string;
  user: string;
  text: string;
  ts: string;
  threadTs?: string;
  channelType: 'channel' | 'dm' | 'group';
}

/**
 * Parse incoming Slack event payload.
 */
export function parseSlackEvent(payload: any): SlackMessage | null {
  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return null;
  }

  // Handle event callback
  if (payload.type === 'event_callback') {
    const event = payload.event;
    if (event.type === 'message' && !event.bot_id) {
      return {
        channel: event.channel,
        user: event.user,
        text: event.text || '',
        ts: event.ts,
        threadTs: event.thread_ts,
        channelType: event.channel_type === 'im' ? 'dm' : 'channel',
      };
    }
  }

  return null;
}

/**
 * Convert Slack message to InboundMessage format.
 */
export function toInboundMessage(
  msg: SlackMessage,
  orgId: string
): {
  orgId: string;
  channel: Channel;
  from: string;
  text: string;
  ref?: string;
} {
  return {
    orgId,
    channel: 'slack',
    from: msg.user,
    text: msg.text,
    ref: msg.threadTs || msg.ts,
  };
}

/**
 * Send a message to a Slack channel or DM.
 */
export async function sendSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: threadTs,
    }),
  });

  const data = await response.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}

/**
 * Reply to a thread in Slack.
 */
export async function replyToThread(
  botToken: string,
  channel: string,
  threadTs: string,
  text: string
): Promise<void> {
  await sendSlackMessage(botToken, channel, text, threadTs);
}

/**
 * Add emoji reaction to a message.
 */
export async function addReaction(
  botToken: string,
  channel: string,
  timestamp: string,
  name: string
): Promise<void> {
  const response = await fetch('https://slack.com/api/reactions.add', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      timestamp,
      name,
    }),
  });

  const data = await response.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}

/**
 * Get channel info by ID.
 */
export async function getChannelInfo(
  botToken: string,
  channelId: string
): Promise<{ name: string; isPrivate: boolean }> {
  const response = await fetch(
    `https://slack.com/api/conversations.info?channel=${channelId}`,
    {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    }
  );

  const data = await response.json() as { ok: boolean; error?: string; channel?: { name: string; is_private: boolean } };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return {
    name: data.channel?.name || '',
    isPrivate: data.channel?.is_private || false,
  };
}

/**
 * List all channels the bot is in.
 */
export async function listChannels(
  botToken: string
): Promise<{ id: string; name: string }[]> {
  const channels: { id: string; name: string }[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL('https://slack.com/api/conversations.list');
    url.searchParams.set('types', 'public_channel,private_channel');
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    const data = await response.json() as { ok: boolean; error?: string; channels?: Array<{ id: string; name: string }>; response_metadata?: { next_cursor?: string } };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    for (const ch of data.channels || []) {
      channels.push({ id: ch.id, name: ch.name });
    }

    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return channels;
}
