// @companybrain/billing — SaaS monetization layer.
//
// Three concerns, all zero-network-by-default:
//   - plans / entitlements: the product catalog + feature gating (pure fns),
//   - license: offline HMAC-signed license keys for the self-host tier,
//   - stripe: a thin fetch() wrapper over the Stripe REST API (checkout + webhooks).
//
// This barrel re-exports the public surface; see each module for details.

// plans
export type { PlanId, Plan } from './plans';
export {
  PLANS,
  UNLIMITED,
  getPlan,
  isOneTime,
  isUnlimited,
} from './plans';

// entitlements
export type { LimitKey, Entitlement } from './entitlements';
export {
  getEntitlement,
  isFeatureAllowed,
  isWithinLimit,
} from './entitlements';

// license
export type { LicenseKey, GenerateLicenseOpts } from './license';
export {
  generateLicense,
  validateLicense,
  parseLicense,
} from './license';

// stripe
export type { StripeConfig, CreateCheckoutOpts, StripeEvent } from './stripe';
export {
  createCheckoutSession,
  verifyWebhookSignature,
  constructStripeEvent,
} from './stripe';
