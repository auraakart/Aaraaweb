import { UnauthorizedException } from '@nestjs/common';
import { loadPartnerDomainContract } from '@aaraagate/config/partner-domain-loader';
import { PartnerRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type HostSessionRequest = { method?: string; header(name: string): string | undefined };
export type HostSessionBinding = { hostClaimId: string; hostClaimVersion: number; originHost: string };

/** Direct raw Host only. Proxy routing and production activation are separate gates. */
export async function verifiedHostSessionBinding(prisma: PrismaService, userId: string,
  request: HostSessionRequest | undefined, binding?: HostSessionBinding) {
  const deny = () => { throw new UnauthorizedException('Host-bound partner access unavailable'); };
  if (!['test', 'development'].includes(process.env.NODE_ENV ?? '') ||
      process.env.AARAGATE_ENABLE_TEST_HOST_SESSIONS !== 'true' || !request) return deny();
  if (request.header('x-forwarded-host') || request.header('forwarded')) return deny();
  const { normalizePartnerDomainHostname } = await loadPartnerDomainContract();
  let hostname: string;
  try {
    const reserved: unknown = JSON.parse(process.env.AARAGATE_PLATFORM_HOSTNAMES ?? '[]');
    if (!Array.isArray(reserved) || reserved.length < 1 || reserved.length > 50 ||
        reserved.some(value => typeof value !== 'string')) return deny();
    hostname = normalizePartnerDomainHostname(request.header('host'), { reservedHostnames: reserved });
  } catch { return deny(); }
  const origin = request.header('origin');
  const safe = request.method === 'GET' || request.method === 'HEAD';
  if ((!safe || origin !== undefined) && origin !== `https://${hostname}`) return deny();
  // Missing/unknown methods are mutations; browser cross-site reads are denied too.
  const fetchSite = request.header('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return deny();
  if (binding && binding.originHost !== hostname) return deny();
  const now = new Date();
  const claim = await prisma.partnerDomainClaim.findFirst({
    where: { hostname, status: 'VERIFIED', verifiedAt: { lte: now }, verifiedUntil: { gt: now },
      partner: { is: { status: 'ACTIVE' } },
      ...(binding ? { id: binding.hostClaimId, version: binding.hostClaimVersion } : {}) },
    select: { id: true, version: true, partnerId: true },
  });
  if (!claim) return deny();
  const [member, grants] = await Promise.all([
    prisma.partnerMembership.findFirst({ where: { partnerId: claim.partnerId, userId, active: true,
      role: { in: [PartnerRole.OWNER, PartnerRole.BRAND_MANAGER, PartnerRole.COMMERCIAL_ADMIN, PartnerRole.SUPPORT] },
      user: { is: { status: 'ACTIVE' } } }, select: { id: true } }),
    prisma.partnerLicenseGrant.findMany({ where: { partnerId: claim.partnerId,
      startsAt: { lte: now }, endsAt: { gt: now }, approval: { is: { revocation: null } } },
      select: { version: true, approval: { select: { grantVersion: true } },
        planRevision: { select: { maximumDomains: true } } }, take: 2 }),
  ]);
  if (!member || grants.length !== 1 || grants[0].approval?.grantVersion !== grants[0].version ||
      grants[0].planRevision.maximumDomains <= 0) return deny();
  const used = await prisma.partnerDomainClaim.count({ where: { partnerId: claim.partnerId,
    status: 'VERIFIED', verifiedUntil: { gt: now } } });
  if (used > grants[0].planRevision.maximumDomains) return deny();
  return { hostClaimId: claim.id, hostClaimVersion: claim.version, originHost: hostname, partnerId: claim.partnerId };
}
