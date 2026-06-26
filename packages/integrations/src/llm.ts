// Optional AI extraction, backed by the official Anthropic SDK. Returns null when no
// ANTHROPIC_API_KEY is set, so the app works with zero AI configured (the domain falls
// back to a heuristic). Every call is wrapped so an API failure degrades to a guess
// rather than breaking lead capture.

import Anthropic from '@anthropic-ai/sdk';
import type { Lead } from '@companybrain/types';

export interface Llm {
  /** turn a free-text note into structured lead fields */
  extractLead(note: string): Promise<Partial<Lead>>;
}

const LEAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    company: { type: 'string' },
    title: { type: 'string' },
    email: { type: 'string' },
    what: { type: 'string' },
  },
  required: ['name', 'company', 'title', 'email', 'what'],
} as const;

/** Cheap, dependency-free heuristic used when no LLM is configured or a call fails. */
function guess(note: string): Partial<Lead> {
  return { name: note.split(/\s+/).slice(0, 2).join(' ') || 'New lead', what: note };
}

export function createLlm(env: NodeJS.ProcessEnv = process.env): Llm | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  return {
    async extractLead(note: string): Promise<Partial<Lead>> {
      try {
        const response = await client.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 1024,
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: LEAD_SCHEMA },
          },
          messages: [
            {
              role: 'user',
              content:
                'Extract structured lead fields from this note. Use an empty string for anything not stated.\n\n' +
                `Note: ${note}`,
            },
          ],
        } as Anthropic.MessageCreateParamsNonStreaming);

        const block = response.content.find((b) => b.type === 'text');
        if (!block || block.type !== 'text') return guess(note);
        const parsed = JSON.parse(block.text) as Partial<Lead>;
        // Keep the original note as the fallback "what" if the model left it blank.
        return { ...parsed, what: parsed.what || note };
      } catch {
        return guess(note);
      }
    },
  };
}
