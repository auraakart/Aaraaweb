import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProductFeature, ProductTier } from '../entitlements/entitlement.types';
import { BrandingService } from './branding.service';
import { societyBrandDigest } from './branding-contract';

const societyId = '11111111-1111-4111-8111-111111111111';
const principal = { userId: 'user-a', societyId, roles: [AppRole.TENANT] };

function fixture() {
  const prisma = {
    societyMembership: { findMany: vi.fn().mockResolvedValue([{ userId: 'user-a', societyId, role: AppRole.TENANT, active: true }]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    withTenantContext: vi.fn(),
    society: { findFirst: vi.fn().mockResolvedValue({ id: societyId, name: 'Society A' }) },
    societyBrandRevision: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  prisma.withTenantContext.mockImplementation(async (_id, callback) => callback(prisma));
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
      new PrismaMembershipRepository(prisma as unknown as PrismaService),
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

  it('does not include custom support contact information in public bootstrap', () => {
    const {service}=fixture();
    expect(service.bootstrap().brand).not.toHaveProperty('support');
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
    expect(prisma.societyMembership.findMany).not.toHaveBeenCalled();
  });

  it('keeps independent-home users society-less even if stale roles are supplied', async () => {
    const { service, prisma, entitlements } = fixture();
    const result = await service.context({ userId: 'user-a', roles: [AppRole.SUPER_ADMIN] });
    expect(result.society).toBeNull();
    expect(result.entitlements).toBeNull();
    expect(prisma.societyMembership.findMany).not.toHaveBeenCalled();
    expect(entitlements.current).not.toHaveBeenCalled();
  });

  it('uses only the server principal and current membership for society scope', async () => {
    const { service, prisma, entitlements } = fixture();
    const result = await service.context(principal);
    expect(prisma.societyMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', societyId, active: true },
    });
    expect(prisma.society.findFirst).toHaveBeenCalledWith({
      where: { id: societyId, status: 'ACTIVE' }, select: { id: true, name: true },
    });
    expect(entitlements.current).toHaveBeenCalledWith(societyId, prisma);
    expect(result.society).toEqual({ id: societyId, name: 'Society A' });
    expect(result.entitlements?.enabledFeatures).toContain(ProductFeature.AI_ASSISTANT);
  });

  it('does not read society metadata when membership is revoked or belongs elsewhere', async () => {
    const { service, prisma, entitlements } = fixture();
    prisma.societyMembership.findMany.mockResolvedValue([]);
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

  it('revalidates a dedicated auditor assignment without trusting stale principal roles', async () => {
    const { service, prisma } = fixture();
    prisma.societyMembership.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ userId: principal.userId, societyId }]);
    await expect(service.context({ ...principal, roles: [] })).resolves.toHaveProperty('society.id', societyId);
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.context({ ...principal, roles: [AppRole.AUDITOR] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses the transaction client for authority, metadata and entitlement reads', async () => {
    const { service, prisma, entitlements } = fixture();
    const tx = {
      societyMembership: { findMany: vi.fn().mockResolvedValue([{ userId: principal.userId, societyId, role: AppRole.TENANT, active: true }]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      society: { findFirst: vi.fn().mockResolvedValue({ id: societyId, name: 'Transaction society' }) },
      societyBrandRevision: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    prisma.withTenantContext.mockImplementation(async (_id, callback) => callback(tx));
    await expect(service.context(principal)).resolves.toHaveProperty('society.name', 'Transaction society');
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(prisma.societyMembership.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.society.findFirst).not.toHaveBeenCalled();
    expect(entitlements.current).toHaveBeenCalledWith(societyId, tx);
  });

  it('renders a published, matching digest for this society without widening features', async () => {
    const { service, prisma, entitlements } = fixture();
    const config = { displayName: 'Palm Grove', colors: { primary: '#155E75', primaryDeep: '#164E63' } };
    prisma.societyBrandRevision.findFirst.mockResolvedValue({
      version: 3, config, digest: societyBrandDigest(config),
    });
    const result = await service.context(principal);
    expect(result.branding).toEqual({
      schemaVersion: 1, revision: `society-${societyId}-v3`,
      brand: { id:'aaraagate', displayName:'Palm Grove',
        colors:{ primary:'#155E75', primaryDeep:'#164E63' } },
    });
    expect(prisma.societyBrandRevision.findFirst).toHaveBeenCalledWith({
      where: { societyId, publishedAt: {not:null} },
      orderBy: [{publishedAt:'desc'},{version:'desc'}],
      select: {version:true,config:true,digest:true},
    });
    expect(result.entitlements?.enabledFeatures).toContain(ProductFeature.AI_ASSISTANT);
    expect(entitlements.current).toHaveBeenCalledTimes(1);
  });

  it('delivers validated published support contacts only inside authenticated society context', async () => {
    const { service, prisma } = fixture();
    const config = { displayName:'Lake Society', support:{email:'help@example.com',phone:'+919876543210'} };
    prisma.societyBrandRevision.findFirst.mockResolvedValue({
      version: 4,config,digest:societyBrandDigest(config),
    });
    const result = await service.context(principal);
    expect(result.branding.brand.support).toEqual({email:'help@example.com',phone:'+919876543210'});
    expect(service.bootstrap().brand.support).toBeUndefined();
    expect((await service.context({userId:principal.userId,roles:[]})).society).toBeNull();
  });

  it('uses exact default presentation when a revision is corrupt or digest mismatched', async () => {
    const { service, prisma } = fixture();
    const baseline = service.bootstrap();
    prisma.societyBrandRevision.findFirst.mockResolvedValue({
      version: 8, config: {displayName:'Injected',featureOverrides:{AI_ASSISTANT:true}},digest:'x'.repeat(64),
    });
    await expect(service.context(principal)).resolves.toHaveProperty('branding', baseline);
    prisma.societyBrandRevision.findFirst.mockResolvedValue({
      version: 9, config: {displayName:'Mismatch'},digest:'0'.repeat(64),
    });
    await expect(service.context(principal)).resolves.toHaveProperty('branding', baseline);
  });

  it('never queries published branding for unauthenticated, revoked or independent identity', async () => {
    const { service, prisma } = fixture();
    await expect(service.context(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await service.context({userId:principal.userId,roles:[]});
    prisma.societyMembership.findMany.mockResolvedValue([]);
    await expect(service.context(principal)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.societyBrandRevision.findFirst).not.toHaveBeenCalled();
  });

  it('does not open a society transaction for independent context or public bootstrap', async () => {
    const { service, prisma } = fixture();
    service.bootstrap();
    await service.context({ userId: principal.userId, roles: [] });
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
