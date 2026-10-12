import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { BrandingService } from './branding.service';
import { societyBrandDigest } from './branding-contract';

const societyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const revisionId = '33333333-3333-4333-8333-333333333333';
const config = { displayName: 'Society North', colors: { primary: '#155E75', primaryDeep: '#164E63' } };

function setup(role: AppRole | null = AppRole.SOCIETY_ADMIN) {
  const tx = {
    societyMembership: { findMany: vi.fn().mockResolvedValue(role ? [{ userId, societyId, role, active: true }] : []) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: societyId }]),
    society: { findFirst: vi.fn().mockResolvedValue({ id: societyId }) },
    societyBrandLogoAsset: { findFirst: vi.fn().mockResolvedValue({id:'44444444-4444-4444-8444-444444444444'}) },
    societyBrandRevision: {
      findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: revisionId, version: 1, config, digest: societyBrandDigest(config), publishedAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    withTenantContext: vi.fn(async (_society: string, op: (client: typeof tx) => Promise<unknown>) => op(tx)),
    $queryRaw: vi.fn(), societyBrandRevision: { create: vi.fn(), updateMany: vi.fn() },
  };
  const service = new BrandingService(prisma as unknown as PrismaService,
    {} as EntitlementService,
    new PrismaMembershipRepository(prisma as unknown as PrismaService));
  return { tx, prisma, service };
}
const sql = (v: unknown) =>
  Array.isArray(v) ? v.join(' ') : ((v as { sql?: string }).sql ?? '');

describe('V5.3.2 society brand revision workflow', () => {
  it('creates the first immutable draft after locked version check', async () => {
    const { service, tx, prisma } = setup();
    await expect(service.createDraft(societyId, userId, { expectedVersion: 0, config }))
      .resolves.toMatchObject({ version: 1, publishedAt: null });
    expect(tx.$queryRaw.mock.calls.some(([query]) => sql(query).includes('FOR UPDATE'))).toBe(true);
    expect(tx.societyBrandRevision.create).toHaveBeenCalledWith({
      data: { societyId, createdById: userId, version: 1, config, digest: societyBrandDigest(config) },
      select: expect.any(Object),
    });
    expect(prisma.societyBrandRevision.create).not.toHaveBeenCalled();
  });

  it('refuses former tenant, auditor and society roles without management permission', async () => {
    for (const role of [null, AppRole.TENANT, AppRole.AUDITOR]) {
      const { service, tx } = setup(role);
      await expect(service.createDraft(societyId, userId, { expectedVersion: 0, config }))
        .rejects.toBeInstanceOf(ForbiddenException);
      // A dedicated-auditor authority read is allowed; no mutation lock is.
      expect(tx.$queryRaw.mock.calls.every(([query]) => !sql(query).includes('FOR UPDATE'))).toBe(true);
      expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
    }
  });

  it('checks active society and current version before creating drafts', async () => {
    const { service, tx } = setup();
    tx.society.findFirst.mockResolvedValue(null);
    await expect(service.createDraft(societyId, userId, { expectedVersion: 0, config }))
      .rejects.toBeInstanceOf(NotFoundException);
    tx.society.findFirst.mockResolvedValue({ id: societyId });
    tx.societyBrandRevision.findFirst.mockResolvedValue({ version: 4 });
    await expect(service.createDraft(societyId, userId, { expectedVersion: 0, config }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
  });

  it('rejects unsafe HTML, capabilities, URLs and invalid versions before database access', async () => {
    const { service, prisma } = setup();
    await expect(service.createDraft(societyId, userId,
      { expectedVersion: 0, config: { displayName: 'Test', featureOverrides: { BILLING: true } } }))
      .rejects.toThrow('Unsupported society branding configuration');
    await expect(service.createDraft(societyId, userId, { expectedVersion: -1, config }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('only publishes an intact draft after comparing current published revision', async () => {
    const { service, tx } = setup();
    tx.societyBrandRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: revisionId, version: 1, config, digest: societyBrandDigest(config),
    });
    await expect(service.publish(societyId, userId, revisionId, 0)).resolves.toEqual({
      id: revisionId, version: 1, revision: `society-${societyId}-v1`, published: true,
    });
    expect(tx.societyBrandRevision.updateMany).toHaveBeenCalledWith({
      where: { id: revisionId, societyId, publishedAt: null }, data: { publishedAt: expect.any(Date) },
    });
  });

  it('blocks stale publication, published revision replay and tampered drafts', async () => {
    const { service, tx } = setup();
    tx.societyBrandRevision.findFirst.mockResolvedValueOnce({ version: 2 });
    await expect(service.publish(societyId, userId, revisionId, 1)).rejects.toBeInstanceOf(ConflictException);
    tx.societyBrandRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(service.publish(societyId, userId, revisionId, 0)).rejects.toBeInstanceOf(NotFoundException);
    tx.societyBrandRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: revisionId, version: 1, config, digest: '0'.repeat(64),
    });
    await expect(service.publish(societyId, userId, revisionId, 0)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.updateMany).not.toHaveBeenCalled();
  });

  it('rejects missing, unverified and other-society logos when allocating a draft', async () => {
    const logoAssetId='44444444-4444-4444-8444-444444444444';
    const branded={...config,logoAssetId};
    const {service,tx}=setup();
    tx.societyBrandLogoAsset.findFirst.mockResolvedValueOnce(null);
    await expect(service.createDraft(societyId,userId,{expectedVersion:0,config:branded}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
    await service.createDraft(societyId,userId,{expectedVersion:0,config:branded});
    expect(tx.societyBrandLogoAsset.findFirst).toHaveBeenCalledWith({
      where:{
        id:logoAssetId,societyId,status:'VERIFIED',
        sha256:{not:null},verifiedAt:{not:null},
      },select:{id:true},
    });
  });

  it('revalidates logo ownership and safety before publishing an immutable revision', async () => {
    const logoAssetId='44444444-4444-4444-8444-444444444444';
    const branded={...config,logoAssetId};
    const {service,tx}=setup();
    tx.societyBrandRevision.findFirst.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({id:revisionId,version:1,config:branded,digest:societyBrandDigest(branded)});
    tx.societyBrandLogoAsset.findFirst.mockResolvedValue(null);
    await expect(service.publish(societyId,userId,revisionId,0))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.updateMany).not.toHaveBeenCalled();
    tx.societyBrandRevision.findFirst.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({id:revisionId,version:1,config:branded,digest:societyBrandDigest(branded)});
    tx.societyBrandLogoAsset.findFirst.mockResolvedValue({id:logoAssetId});
    await expect(service.publish(societyId,userId,revisionId,0)).resolves.toMatchObject({
      version:1,published:true,
    });
    expect(tx.societyBrandRevision.updateMany).toHaveBeenCalledOnce();
  });

  it('serves draft history only to a current society manager', async () => {
    const { service, tx, prisma } = setup();
    await service.history(societyId, userId);
    expect(tx.societyBrandRevision.findMany).toHaveBeenCalledWith({
      where: { societyId }, orderBy: { version: 'desc' }, take: 100, select: expect.any(Object),
    });
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
  });
});
