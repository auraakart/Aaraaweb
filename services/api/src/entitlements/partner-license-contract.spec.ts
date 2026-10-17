import { describe, expect, it } from 'vitest';
import { ProductFeature, ProductTier, TIER_FEATURES } from './entitlement.types';
import {
  intersectPartnerLicenseFeatures,
  licensePhaseAt,
  previewPartnerCapacity,
} from './partner-license-contract';

const { VISITOR_MANAGEMENT: VISITOR, SOS, PAYMENTS, NOTICES, HELPDESK } = ProductFeature;
const base = {
  platformSafetyAllowlist: [VISITOR, SOS, PAYMENTS, NOTICES],
  partnerLicenseAllowlist: [SOS, VISITOR, PAYMENTS, NOTICES],
  societySubscriptionAllowlist: [VISITOR, SOS, NOTICES],
  societyOperationalAllowlist: [SOS, VISITOR, PAYMENTS],
} as const;

describe('V5.4.1 partner licensing policy (no live entitlement activation)', () => {
  it('intersects all four allowlists with stable ProductFeature catalogue ordering', () => {
    expect(intersectPartnerLicenseFeatures(base)).toEqual([VISITOR, SOS]);
    expect(intersectPartnerLicenseFeatures({
      ...base, partnerLicenseAllowlist: [],
    })).toEqual([]);
    expect(intersectPartnerLicenseFeatures({
      ...base, societyOperationalAllowlist: [SOS],
    })).toEqual([SOS]);
  });

  it('rejects unknown or duplicate features, and malformed lists rather than granting access', () => {
    expect(() => intersectPartnerLicenseFeatures({
      ...base, partnerLicenseAllowlist: [VISITOR, VISITOR],
    })).toThrow(/duplicate/);
    expect(() => intersectPartnerLicenseFeatures({
      ...base, societySubscriptionAllowlist: ['FAKE_FEATURE' as ProductFeature],
    })).toThrow(/Invalid/);
    expect(() => intersectPartnerLicenseFeatures({
      ...base, platformSafetyAllowlist: null as unknown as ProductFeature[],
    })).toThrow(/Invalid/);
  });

  it('keeps legacy tier catalogue immutable while calculating a separate candidate ceiling', () => {
    const legacyStarter = [...TIER_FEATURES[ProductTier.STARTER]];
    expect(legacyStarter).toContain(VISITOR);
    expect(legacyStarter).toContain(SOS);
    expect(legacyStarter).toContain(NOTICES);
    expect(intersectPartnerLicenseFeatures({
      ...base, societySubscriptionAllowlist: legacyStarter, partnerLicenseAllowlist: [HELPDESK],
    })).toEqual([]);
    expect(TIER_FEATURES[ProductTier.STARTER]).toEqual(legacyStarter);
  });

  it('has an inclusive start, exclusive end, and bounded explicit grace interval', () => {
    const window = {
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-11-01T00:00:00Z',
      graceUntil: '2026-11-08T00:00:00Z',
    };
    expect(licensePhaseAt(window, '2026-09-30T23:59:59Z')).toBe('NOT_STARTED');
    expect(licensePhaseAt(window, window.startsAt)).toBe('ACTIVE');
    expect(licensePhaseAt(window, '2026-10-31T23:59:59Z')).toBe('ACTIVE');
    expect(licensePhaseAt(window, window.endsAt)).toBe('GRACE');
    expect(licensePhaseAt(window, window.graceUntil)).toBe('EXPIRED');
    expect(licensePhaseAt({...window, graceUntil:null},window.endsAt)).toBe('EXPIRED');
  });

  it('rejects malformed dates, impossible UTC dates and backwards periods', () => {
    const valid = {startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-11-01T00:00:00Z'};
    expect(() => licensePhaseAt(valid, '2026-10-01')).toThrow();
    expect(() => licensePhaseAt({...valid,startsAt:'2026-02-30T00:00:00Z'},valid.endsAt)).toThrow();
    expect(() => licensePhaseAt({...valid, endsAt:valid.startsAt},valid.endsAt)).toThrow();
    expect(() => licensePhaseAt({...valid, graceUntil:'2026-10-31T00:00:00Z'},valid.endsAt)).toThrow();
    expect(() => licensePhaseAt({...valid, endsAt:'2026-11-01T00:00:00+05:30'},valid.startsAt)).toThrow();
  });

  it('previews capacity boundaries but never writes an allocation', () => {
    expect(previewPartnerCapacity({maximumSocieties:50,alreadyAllocated:49,requestedAdditional:1}))
      .toEqual({withinLimit:true,remainingBeforeRequest:1});
    expect(previewPartnerCapacity({maximumSocieties:50,alreadyAllocated:49,requestedAdditional:2}))
      .toEqual({withinLimit:false,remainingBeforeRequest:1});
    expect(previewPartnerCapacity({maximumSocieties:1,alreadyAllocated:3,requestedAdditional:1}))
      .toEqual({withinLimit:false,remainingBeforeRequest:0});
    expect(() => previewPartnerCapacity({maximumSocieties:-1,alreadyAllocated:0,requestedAdditional:1})).toThrow();
    expect(() => previewPartnerCapacity({maximumSocieties:50,alreadyAllocated:1.5,requestedAdditional:1})).toThrow();
    expect(() => previewPartnerCapacity({maximumSocieties:50,alreadyAllocated:0,requestedAdditional:0})).toThrow();
  });
});
