import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { ProductFeature, ProductTier } from '../entitlements/entitlement.types';
import { BrandingService } from './branding.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const principal = { userId: 'user-a', societyId, roles: [AppRole.TENANT] };

function fixture() {
  const prisma = {
    societyMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
    society: { findFirst: vi.fn().mockResolvedValue({ id: societyId, name: 'Society A' }) },
  };
  const entitlements = { current: vi.fn().mockResolvedValue({
    productTier: ProductTier.STARTER,
    // This authorized override must survive even though AI is outside STARTER.
    enabledFeatures: [ProductFeature.VISITOR_MANAGEMENT, ProductFeature.AI_ASSISTANT],
  }) };
  return {
    prisma, entitlements,
    service: new BrandingService(
      prisma as unknown as ConstructorParameters<typeof BrandingService>[0],
      entitlements as unknown as ConstructorParameters<typeof BrandingService>[1],
    ),
  };
}

describe('BrandingService V5 default compatibility', () => {
  it('provides public default presentation with no operational data or capabilities', () => {
    const { service, prisma, entitlements } = fixture();
    expect(service.bootstrap()).toEqual({
      schemaVersion: 1, revision: 'aaraagate-default-v1',
      brand: { id: 'aaraagate', displayName: 'Aaraagate', colors: { primary: '#0EABBE', primaryDeep: '#05879A' } },
    });
    expect(prisma.society.findFirst).not.toHaveBeenCalled();
    expect(entitlements.current).not.toHaveBeenCalled();
  });

  it('prevents a caller from modifying the shared default for subsequent requests', () => {
    const { service } = fixture();
    const first = service.bootstrap();
    first.brand.id = 'partner-b';
    first.brand.colors.primary = '#FFFFFF';
    expect(service.bootstrap().brand).toMatchObject({ id: 'aaraagate', colors: { primary: '#0EABBE' } });
  });

  it('rejects missing authentication before querying any context', async () => {
    const { service, prisma } = fixture();
    await expect(service.context(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.societyMembership.findFirst).not.toHaveBeenCalled();
  });

  it('keeps independent-home users society-less even if stale roles are supplied', async () => {
    const { service, prisma, entitlements } = fixture();
    const result = await service.context({ userId: 'user-a', roles: [AppRole.SUPER_ADMIN] });
    expect(result.society).toBeNull();
    expect(result.entitlements).toBeNull();
    expect(prisma.societyMembership.findFirst).not.toHaveBeenCalled();
    expect(entitlements.current).not.toHaveBeenCalled();
  });

  it('uses only the server principal and current membership for society scope', async () => {
    const { service, prisma, entitlements } = fixture();
    const result = await service.context(principal);
    expect(prisma.societyMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-a', societyId, active: true }, select: { id: true },
    });
    expect(prisma.society.findFirst).toHaveBeenCalledWith({
      where: { id: societyId, status: 'ACTIVE' }, select: { id: true, name: true },
    });
    expect(entitlements.current).toHaveBeenCalledWith(societyId);
    expect(result.society).toEqual({ id: societyId, name: 'Society A' });
    expect(result.entitlements?.enabledFeatures).toContain(ProductFeature.AI_ASSISTANT);
  });

  it('does not read society metadata when membership is revoked or belongs elsewhere', async () => {
    const { service, prisma, entitlements } = fixture();
    prisma.societyMembership.findFirst.mockResolvedValue(null);
    await expect(service.context(principal)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.society.findFirst).not.toHaveBeenCalled();
    expect(entitlements.current).not.toHaveBeenCalled();
  });

  it.each(['society', 'entitlements'])('fails closed if %s context is unavailable', async (missing) => {
    const { service, prisma, entitlements } = fixture();
    if (missing === 'society') prisma.society.findFirst.mockResolvedValue(null);
    else entitlements.current.mockResolvedValue(null);
    await expect(service.context(principal)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not mutate the legacy entitlement resolver result', async () => {
    const { service, entitlements } = fixture();
    const result = await service.context(principal);
    result.entitlements?.enabledFeatures.push('PARTNER_ADMIN');
    const second = await service.context(principal);
    expect(second.entitlements?.enabledFeatures).not.toContain('PARTNER_ADMIN');
    expect(entitlements.current).toHaveBeenCalledTimes(2);
  });
});
