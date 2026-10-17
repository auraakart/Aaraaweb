import { ProductFeature } from './entitlement.types';

/**
 * V5.4 contract only. This module is deliberately NOT wired to
 * EntitlementService, FeatureGuard, sessions, partner permissions or billing.
 * Until a legacy-preserving subscription cutover is approved, Society.productTier
 * and boolean featureOverrides remain the sole live entitlement authority.
 */
export type PartnerLicenseWindow = Readonly<{
  startsAt: string;
  endsAt: string;
  graceUntil?: string | null;
}>;

export type PartnerLicensePhase = 'NOT_STARTED' | 'ACTIVE' | 'GRACE' | 'EXPIRED';

const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const knownFeatures = new Set<string>(Object.values(ProductFeature));

function parseUtcTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'string' || !utcTimestamp.test(value)) {
    throw new Error(`Invalid UTC ${field}`);
  }
  const parsed = Date.parse(value);
  // Date.parse can silently normalize impossible calendar dates.
  if (!Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error(`Invalid UTC ${field}`);
  }
  return parsed;
}

/** UTC inclusive start, exclusive end, and exclusive optional grace boundary. */
export function licensePhaseAt(window: PartnerLicenseWindow, at: string): PartnerLicensePhase {
  const starts = parseUtcTimestamp(window.startsAt, 'startsAt');
  const ends = parseUtcTimestamp(window.endsAt, 'endsAt');
  const now = parseUtcTimestamp(at, 'evaluation timestamp');
  if (ends <= starts) throw new Error('License must end after it starts');
  const grace = window.graceUntil == null ? ends : parseUtcTimestamp(window.graceUntil, 'graceUntil');
  if (grace < ends) throw new Error('Grace cannot end before license expiry');
  if (now < starts) return 'NOT_STARTED';
  if (now < ends) return 'ACTIVE';
  if (now < grace) return 'GRACE';
  return 'EXPIRED';
}

export type PartnerLicenseFeatureCeilings = Readonly<{
  platformSafetyAllowlist: readonly ProductFeature[];
  partnerLicenseAllowlist: readonly ProductFeature[];
  societySubscriptionAllowlist: readonly ProductFeature[];
  societyOperationalAllowlist: readonly ProductFeature[];
}>;

function featureSet(value: unknown, field: string): Set<string> {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field}`);
  const result = new Set<string>();
  for (const feature of value) {
    if (typeof feature !== 'string' || !knownFeatures.has(feature) || result.has(feature)) {
      throw new Error(`Invalid or duplicate feature in ${field}`);
    }
    result.add(feature);
  }
  return result;
}

/**
 * Deterministic candidate feature ceiling for FUTURE opt-in license grants.
 * It never returns roles, operational permissions or an authorization decision.
 * Callers must separately check current society membership, subscription
 * migration state, partner ownership and policy for essential gate/SOS flows.
 */
export function intersectPartnerLicenseFeatures(input: PartnerLicenseFeatureCeilings): ProductFeature[] {
  const platform = featureSet(input.platformSafetyAllowlist, 'platformSafetyAllowlist');
  const partner = featureSet(input.partnerLicenseAllowlist, 'partnerLicenseAllowlist');
  const subscription = featureSet(input.societySubscriptionAllowlist, 'societySubscriptionAllowlist');
  const operational = featureSet(input.societyOperationalAllowlist, 'societyOperationalAllowlist');
  return Object.values(ProductFeature).filter(feature =>
    platform.has(feature) && partner.has(feature) &&
    subscription.has(feature) && operational.has(feature));
}

export type PartnerCapacityPreview = Readonly<{
  maximumSocieties: number;
  alreadyAllocated: number;
  requestedAdditional: number;
}>;

/**
 * Preview only; allocating capacity MUST use an atomic, scoped DB transaction
 * with an idempotency key, ownership check and current-plan version check.
 */
export function previewPartnerCapacity(input: PartnerCapacityPreview): {
  withinLimit: boolean;
  remainingBeforeRequest: number;
} {
  const { maximumSocieties, alreadyAllocated, requestedAdditional } = input;
  if (![maximumSocieties, alreadyAllocated, requestedAdditional].every(Number.isSafeInteger) ||
      maximumSocieties < 0 || alreadyAllocated < 0 || requestedAdditional < 1) {
    throw new Error('Invalid partner capacity input');
  }
  const remaining = Math.max(0, maximumSocieties - alreadyAllocated);
  return {
    withinLimit: requestedAdditional <= remaining,
    remainingBeforeRequest: remaining,
  };
}
