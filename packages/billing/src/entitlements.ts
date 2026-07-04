// Feature gating: what each plan is allowed to do.
//
// The single source of truth for "can this plan use X?" lives here so that the
// UI, the API, and the license validator never disagree. Everything is a pure
// function of PlanId — no DB, no network.

import { getPlan, isUnlimited, type PlanId } from './plans';

export type LimitKey = 'users' | 'integrations' | 'tasksPerMonth';

export interface Entitlement {
  /** Every feature string the plan unlocks (matches `Plan.features` entries). */
  features: Set<string>;
  /** Numeric caps keyed the same way as `Plan.limits`. */
  limits: Record<LimitKey, number>;
  canUploadAttachments: boolean;
  canUseAi: boolean;
  canUseVoice: boolean;
  canViewAnalytics: boolean;
  canManageTeam: boolean;
  maxUsers: number;
}

/** Per-plan gating flags. Pro / Lifetime / Enterprise get everything; Free is locked down. */
export function getEntitlement(plan: PlanId): Entitlement {
  const p = getPlan(plan);

  switch (plan) {
    case 'free':
      return {
        features: new Set(p.features),
        limits: { ...p.limits },
        canUploadAttachments: false,
        canUseAi: false,
        canUseVoice: false,
        canViewAnalytics: false,
        canManageTeam: false,
        maxUsers: p.limits.users,
      };
    case 'pro':
    case 'lifetime':
    case 'enterprise':
      return {
        features: new Set(p.features),
        limits: { ...p.limits },
        canUploadAttachments: true,
        canUseAi: true,
        canUseVoice: true,
        canViewAnalytics: true,
        canManageTeam: true,
        maxUsers: p.limits.users,
      };
    default: {
      // Defensive: unknown plan id behaves like Free.
      const free = getPlan('free');
      return {
        features: new Set(free.features),
        limits: { ...free.limits },
        canUploadAttachments: false,
        canUseAi: false,
        canUseVoice: false,
        canViewAnalytics: false,
        canManageTeam: false,
        maxUsers: free.limits.users,
      };
    }
  }
}

/**
 * Is a named feature unlocked for this plan?
 *
 * `feature` is matched case-insensitively against the plan's `features` list.
 * For convenience, a handful of stable feature tokens ("ai", "voice",
 * "analytics", "attachments", "team", "sso", "audit_logs") are also recognized.
 */
export function isFeatureAllowed(plan: PlanId, feature: string): boolean {
  const ent = getEntitlement(plan);
  const needle = feature.trim().toLowerCase();

  if (needle === '') return false;

  // Stable shorthand tokens.
  if (needle === 'ai' || needle === 'ai_auto_assign') return ent.canUseAi;
  if (needle === 'voice') return ent.canUseVoice;
  if (needle === 'analytics' || needle === 'advanced_analytics') return ent.canViewAnalytics;
  if (needle === 'attachments' || needle === 'upload_attachments') return ent.canUploadAttachments;
  if (needle === 'team' || needle === 'team_dashboards' || needle === 'manage_team') return ent.canManageTeam;
  if (needle === 'sso' || needle === 'single_sign-on') return plan === 'enterprise';
  if (needle === 'audit' || needle === 'audit_logs' || needle === 'auditlogs') return plan === 'enterprise';

  // Substring match against the human-readable features list.
  for (const f of ent.features) {
    if (f.toLowerCase().includes(needle)) return true;
  }
  return false;
}

/**
 * Is `current` within the plan's cap for `limit`?
 * Treats unlimited limits (>= Number.MAX_SAFE_INTEGER) as never exceeded.
 */
export function isWithinLimit(plan: PlanId, limit: LimitKey, current: number): boolean {
  const ent = getEntitlement(plan);
  const cap = ent.limits[limit];
  if (cap === undefined) return false;
  if (isUnlimited(cap)) return true;
  return current < cap;
}
