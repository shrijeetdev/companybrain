// Gmail integration — watches inbox and creates loops from emails.
// Uses Gmail API with OAuth2 for secure access.

import { google, type gmail_v1 } from 'googleapis';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
  /** Email address to watch */
  emailAddress: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
}

/**
 * Create Gmail client with OAuth2 credentials.
 */
export function createGmailClient(config: GmailConfig): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Get recent unread emails from inbox.
 */
export async function getUnreadEmails(
  gmail: gmail_v1.Gmail,
  maxResults: number = 10
): Promise<GmailMessage[]> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults,
  });

  const messages = response.data.messages || [];
  const emails: GmailMessage[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });

    const headers = (full.data.payload?.headers ?? []) as gmail_v1.Schema$MessagePartHeader[];
    const getHeader = (name: string) =>
      headers.find((h: gmail_v1.Schema$MessagePartHeader) => (h.name ?? '').toLowerCase() === name.toLowerCase())?.value || '';

    emails.push({
      id: msg.id,
      threadId: msg.threadId || '',
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      snippet: full.data.snippet || '',
      date: getHeader('Date'),
      labels: full.data.labelIds || [],
    });
  }

  return emails;
}

/**
 * Send a reply to an email thread.
 */
export async function sendReply(
  gmail: gmail_v1.Gmail,
  threadId: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const raw = [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encodedMessage = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId,
    },
  });
}

/**
 * Mark an email as read.
 */
export async function markAsRead(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<void> {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
    },
  });
}

/**
 * Watch inbox for new emails (long-polling).
 * Returns a watch expiration and history ID.
 */
export async function watchInbox(
  gmail: gmail_v1.Gmail,
  topicName: string
): Promise<{ historyId: string; expiration: string }> {
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName,
      labelIds: ['INBOX'],
    },
  });

  return {
    historyId: response.data.historyId || '',
    expiration: response.data.expiration || '',
  };
}

/**
 * Get changes since last history ID.
 */
export async function getChanges(
  gmail: gmail_v1.Gmail,
  startHistoryId: string
): Promise<{ messagesAdded: string[]; historyId: string }> {
  const response = await gmail.users.history.list({
    userId: 'me',
    startHistoryId,
    historyTypes: ['messageAdded'],
  });

  const history = response.data.history || [];
  const messagesAdded: string[] = [];

  for (const record of history) {
    for (const msg of record.messagesAdded || []) {
      if (msg.message?.id) {
        messagesAdded.push(msg.message.id);
      }
    }
  }

  return {
    messagesAdded,
    historyId: response.data.historyId || startHistoryId,
  };
}
