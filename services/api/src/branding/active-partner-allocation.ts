import { Prisma } from '@prisma/client';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalLicenseJson, sameLicenseFeatures } from '../entitlements/partner-license-lifecycle.service';

/** Read-only compatibility check. A brand/application scope never enables features. */
export async function activePartnerAllocation(tx: Prisma.TransactionClient, societyId: string,
  partnerId: string, ownershipVersion: number, allocationId?: string) {
  const now = new Date();
  const allocations = await tx.societyLicenseAllocation.findMany({
    where: { societyId, ownershipVersion, ...(allocationId ? { id: allocationId } : {}),
      approval: { is: { revocation: null, grant: { is: { partnerId, startsAt: { lte: now }, endsAt: { gt: now }, partner: { is: { status: 'ACTIVE' } } } } } } },
    include: { approval: { include: { grant: { include: { planRevision: true } } } } }, take: 2,
  });
  if (allocations.length !== 1) return null;
  const allocation = allocations[0], grant = allocation.approval.grant;
  if (allocation.approval.grantVersion !== grant.version) return null;
  const consent = await tx.societyLicenseConsent.findFirst({
    where: { societyId, ownershipVersion, grantId: grant.id }, orderBy: { sequence: 'desc' },
  });
  const [society, current] = await Promise.all([
    tx.society.findFirst({ where: { id: societyId, status: 'ACTIVE', partnerId, ownershipVersion }, select: { productTier: true, featureOverrides: true } }),
    new EntitlementService({} as PrismaService).current(societyId, tx),
  ]);
  if (!society || !current || !consent || consent.id !== allocation.consentId || consent.decision !== 'OPT_IN' ||
      consent.grantVersion !== grant.version || consent.productTier !== society.productTier ||
      canonicalLicenseJson(consent.featureOverrides) !== canonicalLicenseJson(society.featureOverrides) ||
      !sameLicenseFeatures(consent.enabledFeatures, current.enabledFeatures)) return null;
  const allow = grant.planRevision.featureAllowlist;
  if (!Array.isArray(allow) || !current.enabledFeatures.every(feature => allow.includes(feature))) return null;
  return allocation;
}
