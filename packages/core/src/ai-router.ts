// Per-action model routing. Static defaults, env-overridable, per-task overridable.
// Deliberately two entries (not a tier system) — add tiers only if a real cost/quality
// tradeoff shows up.

import type { AiActionType } from '@companybrain/types';

const DEFAULTS: Record<AiActionType, string> = {
  generate: 'anthropic/claude-3.5-sonnet',
  publish_blog: 'anthropic/claude-3.5-sonnet',
};

const ENV_KEY: Record<AiActionType, string> = {
  generate: 'COMPANYBRAIN_AI_MODEL_GENERATE',
  publish_blog: 'COMPANYBRAIN_AI_MODEL_PUBLISH_BLOG',
};

/** Resolve the OpenRouter model slug for an action. Override precedence: task > env > default. */
export function resolveModel(action: AiActionType, override?: string | null, env: NodeJS.ProcessEnv = process.env): string {
  if (override && override.trim()) return override.trim();
  const envVal = env[ENV_KEY[action]];
  if (envVal && envVal.trim()) return envVal.trim();
  return DEFAULTS[action];
}
