import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { activePartnerAllocation } from '../branding/active-partner-allocation';
import { AppRole } from './auth.types';

/** Restricts an existing society login; this identifier never grants membership.
 * TEST sessions stay disabled until explicitly enabled by the TEST operator. */
export async function assertApplicationSociety(prisma: PrismaService, applicationId: string, societyId: string, roles: AppRole[], stage: 'ISSUE' | 'OPERATE' = 'ISSUE') {
  if (!['test','development'].includes(process.env.NODE_ENV ?? '') || process.env.AARAGATE_ENABLE_TEST_APP_SESSIONS !== 'true')
    throw new UnauthorizedException('Application sessions unavailable');
  return prisma.withTenantContext(societyId, async tx => {
    const app = await tx.partnerApplication.findUnique({ where: { id: applicationId } });
    const society = await tx.society.findFirst({ where: { id: societyId, status: 'ACTIVE' }, select: { id: true, partnerId: true, ownershipVersion: true } });
    if (!app || !society || app.partnerId !== society.partnerId) throw new UnauthorizedException('Application society unavailable');
    const required = app.appRole === 'GUARD' ? [AppRole.SECURITY_GUARD,AppRole.SECURITY_SUPERVISOR] : [AppRole.OWNER,AppRole.TENANT,AppRole.FAMILY_MEMBER];
    if (!roles.some(role => required.includes(role))) throw new UnauthorizedException('Application role unavailable');
    const scopes = await tx.partnerApplicationScope.findMany({ where: { applicationId, societyId, ownershipVersion: society.ownershipVersion, approvedAt: { not: null }, revokedAt: null }, take: 51 });
    if (scopes.length > 50) throw new UnauthorizedException('Application scope ambiguous');
    // Commercial expiry/withdrawal cannot remove existing Gate/SOS/legacy
    // operational rights. Explicit scope revocation or ownership change still
    // stops this application; every caller separately reloads membership/RBAC.
    if (stage === 'OPERATE' && scopes.length > 0) return app;
    for (const scope of scopes) if (await activePartnerAllocation(tx,societyId,app.partnerId,society.ownershipVersion,scope.allocationId)) return app;
    throw new UnauthorizedException('Application allocation unavailable');
  });
}
