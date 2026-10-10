// Product catalog: the plans customers can buy.
//
// Free / Pro / Enterprise are recurring SaaS tiers; `lifetime` is a one-time
// self-host license. Everything else in this package (entitlements, license
// keys, Stripe checkout) is driven from PLANS below.

export type PlanId = 'free' | 'pro' | 'enterprise' | 'lifetime';

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  interval: 'one_time' | 'month' | 'year';
  features: string[];
  limits: {
    users: number;
    integrations: number;
    tasksPerMonth: number;
  };
  description: string;
  badge?: string;
}

/**
 * `Infinity` is serialized as `Number.POSITIVE_INFINITY` at runtime; callers
 * reading limits should treat any limit >= Number.MAX_SAFE_INTEGER as unlimited.
 * We use a large sentinel instead of literal Infinity so the value stays JSON-
 * serializable and is safe to round-trip through SQLite/Stripe metadata.
 */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    interval: 'month',
    features: ['Core task management', 'Up to 2 integrations', 'Basic dashboard'],
    limits: { users: 1, integrations: 2, tasksPerMonth: 50 },
    description: 'Everything you need to get organized and never let a loop slip.',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 19,
    interval: 'month',
    features: [
      'Everything in Free',
      'Unlimited integrations',
      'AI auto-assign',
      'Advanced analytics',
      'Priority support',
      'Team dashboards',
    ],
    limits: { users: 10, integrations: UNLIMITED, tasksPerMonth: UNLIMITED },
    description: 'For teams that want the AI working every channel, full-throttle.',
    badge: 'Most Popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceUsd: 99,
    interval: 'month',
    features: [
      'Everything in Pro',
      'Single sign-on (SSO)',
      'Audit logs',
      'Dedicated support',
      'Unlimited everything',
    ],
    limits: { users: UNLIMITED, integrations: UNLIMITED, tasksPerMonth: UNLIMITED },
    description: 'For organizations that need SSO, audit trails, and a direct line to us.',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    priceUsd: 499,
    interval: 'one_time',
    features: [
      'Everything in Pro',
      'Self-host forever',
      'Source code access',
      '1 year of updates',
      'Lifetime license',
    ],
    limits: { users: 10, integrations: UNLIMITED, tasksPerMonth: UNLIMITED },
    description: 'Pay once, self-host forever. Source code access and a lifetime license for 1 org.',
    badge: 'Best Value',
  },
];

const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(
  PLANS.map((p) => [p.id, p]),
) as Record<PlanId, Plan>;

/** Look up a plan by id. Returns the Free plan as a safe fallback. */
export function getPlan(id: PlanId): Plan {
  return PLAN_BY_ID[id] ?? PLANS[0]!;
}

/** True for plans that never expire and never rebill (the self-host license). */
export function isOneTime(plan: PlanId): boolean {
  return getPlan(plan).interval === 'one_time';
}

/** Is `n` effectively unlimited? Use this when reading limits off a Plan. */
export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED;
}
