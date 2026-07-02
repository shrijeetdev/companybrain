// GitHub integration — watches repos and creates loops from issues/PRs.
// Uses GitHub webhooks for event-driven message handling.

import type { Channel } from '@companybrain/types';

export interface GitHubConfig {
  /** Personal access token for API access */
  token: string;
  /** Webhook secret for payload verification */
  webhookSecret: string;
}

export interface GitHubEvent {
  action: string;
  eventType: string;
  repo: string;
  sender: string;
  number?: number;
  title?: string;
  body?: string;
  url: string;
}

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(payload).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Parse incoming GitHub webhook payload.
 */
export function parseGitHubEvent(payload: any, eventType: string): GitHubEvent | null {
  const action = payload.action;
  if (!action) return null;

  const repo = payload.repository?.full_name || '';
  const sender = payload.sender?.login || '';
  const url = payload.repository?.html_url || '';

  switch (eventType) {
    case 'issues':
      return {
        action,
        eventType: 'issue',
        repo,
        sender,
        number: payload.issue?.number,
        title: payload.issue?.title,
        body: payload.issue?.body,
        url: payload.issue?.html_url || url,
      };

    case 'pull_request':
      return {
        action,
        eventType: 'pr',
        repo,
        sender,
        number: payload.pull_request?.number,
        title: payload.pull_request?.title,
        body: payload.pull_request?.body,
        url: payload.pull_request?.html_url || url,
      };

    case 'issue_comment':
      return {
        action,
        eventType: 'comment',
        repo,
        sender,
        number: payload.issue?.number,
        title: `Comment on #${payload.issue?.number}`,
        body: payload.comment?.body,
        url: payload.comment?.html_url || url,
      };

    default:
      return null;
  }
}

/**
 * Convert GitHub event to InboundMessage format.
 */
export function toInboundMessage(
  event: GitHubEvent,
  orgId: string
): {
  orgId: string;
  channel: Channel;
  from: string;
  text: string;
  ref?: string;
} {
  const title = event.title ? `[${event.repo}] ${event.title}` : `[${event.repo}] ${event.eventType}`;

  return {
    orgId,
    channel: 'github',
    from: event.sender,
    text: `${event.action}: ${title}\n\n${event.body || ''}`.trim(),
    ref: event.url,
  };
}

/**
 * Create a comment on an issue or PR.
 */
export async function createComment(
  token: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(`GitHub API error: ${errorData.message}`);
  }
}

/**
 * Get issue details.
 */
export async function getIssue(
  token: string,
  repo: string,
  issueNumber: number
): Promise<{ title: string; body: string; state: string; labels: string[] }> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(`GitHub API error: ${errorData.message}`);
  }

  const data = await response.json() as { title: string; body?: string; state: string; labels: Array<{ name: string }> };
  return {
    title: data.title,
    body: data.body || '',
    state: data.state,
    labels: data.labels.map((l) => l.name),
  };
}

/**
 * List issues in a repository.
 */
export async function listIssues(
  token: string,
  repo: string,
  state: 'open' | 'closed' = 'open'
): Promise<{ number: number; title: string; state: string }[]> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=${state}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as { message?: string };
    throw new Error(`GitHub API error: ${errorData.message}`);
  }

  const data = await response.json() as Array<{ number: number; title: string; state: string }>;
  return data.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
  }));
}
