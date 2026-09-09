import { describe, expect, it, vi } from 'vitest';
import { EntitlementService } from './entitlement.service';
import { ProductFeature, ProductTier } from './entitlement.types';

type SocietyEntitlement = {
  productTier: ProductTier;
  featureOverrides: Record<string, boolean>;
} | null;

function service(society: SocietyEntitlement) {
  const prisma = {
    society: { findFirst: vi.fn().mockResolvedValue(society) },
  };
  return new EntitlementService(prisma as unknown as ConstructorParameters<typeof EntitlementService>[0]);
}

describe('EntitlementService', () => {
  it('enables features included in the society tier', async () => {
    const svc = service({ productTier: ProductTier.STARTER, featureOverrides: {} });
    await expect(svc.isEnabled('society-1', ProductFeature.VISITOR_MANAGEMENT)).resolves.toBe(true);
  });

  it('denies features outside the society tier by default', async () => {
    const svc = service({ productTier: ProductTier.STARTER, featureOverrides: {} });
    await expect(svc.isEnabled('society-1', ProductFeature.PAYMENTS)).resolves.toBe(false);
  });

  it('allows an explicit tenant feature upgrade', async () => {
    const svc = service({
      productTier: ProductTier.STARTER,
      featureOverrides: { [ProductFeature.HOUSEHOLD_SERVICES]: true },
    });
    await expect(svc.isEnabled('society-1', ProductFeature.HOUSEHOLD_SERVICES)).resolves.toBe(true);
  });

  it('allows an explicit tenant feature restriction', async () => {
    const svc = service({
      productTier: ProductTier.PREMIUM,
      featureOverrides: { [ProductFeature.WHATSAPP_AUTOMATION]: false },
    });
    await expect(svc.isEnabled('society-1', ProductFeature.WHATSAPP_AUTOMATION)).resolves.toBe(false);
  });

  it('returns effective features with overrides applied', async () => {
    const svc = service({
      productTier: ProductTier.STARTER,
      featureOverrides: {
        [ProductFeature.ADVANCED_REPORTS]: true,
        [ProductFeature.NOTICES]: false,
      },
    });
    await expect(svc.current('society-1')).resolves.toEqual({
      productTier: ProductTier.STARTER,
      enabledFeatures: expect.arrayContaining([ProductFeature.VISITOR_MANAGEMENT, ProductFeature.ADVANCED_REPORTS]),
    });
    const current = await svc.current('society-1');
    expect(current?.enabledFeatures).not.toContain(ProductFeature.NOTICES);
  });

  it('denies access for a missing or inactive society', async () => {
    const svc = service(null);
    await expect(svc.isEnabled('society-x', ProductFeature.VISITOR_MANAGEMENT)).resolves.toBe(false);
    await expect(svc.current('society-x')).resolves.toBeNull();
  });
});
