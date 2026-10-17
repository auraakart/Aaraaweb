import { Injectable, NotFoundException } from '@nestjs/common';
import { PartnerRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V5.4.4 read-only partner control plane. A partner role is NOT an AppRole,
 * SocietyMembership, permission grant, license or right to operational PII.
 * Requester identity always comes from the bearer-authenticated session.
 */
@Injectable()
export class PartnerPortfolioReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Discover only the authenticated user's current commercial workspaces. */
  workspaces(userId: string) {
    return this.prisma.partnerMembership.findMany({
      where: {
        userId, active: true, user: { is: { status: 'ACTIVE' } },
        role: { in: [PartnerRole.OWNER, PartnerRole.BRAND_MANAGER, PartnerRole.COMMERCIAL_ADMIN] },
        partner: { is: { status: 'ACTIVE' } },
      },
      select: { id: true, role: true, partner: { select: { id: true, displayName: true } } },
      orderBy: { id: 'asc' }, take: 51,
    }).then(rows => ({ memberships: rows.slice(0, 50), hasMore: rows.length > 50 }));
  }

  private async withVisiblePartner<T>(
    userId: string,
    partnerId: string,
    roles: readonly PartnerRole[],
    read: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async tx => {
      const membership = await tx.partnerMembership.findFirst({
        where: {
          userId, partnerId, active: true,
          user: { is: { status: 'ACTIVE' } },
          role: { in: [...roles] },
          partner: { is: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership) {
        // Identical response for a missing partner, foreign partner, revoked
        // membership or partner lacking the permitted control-plane role.
        throw new NotFoundException('Partner resource unavailable');
      }
      return read(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /**
   * Society display metadata only. Never select units, residents, owners,
   * gate events, finance, complaints or service-provider information.
   */
  portfolio(userId: string, partnerId: string) {
    return this.withVisiblePartner(userId, partnerId, [
      PartnerRole.OWNER, PartnerRole.BRAND_MANAGER, PartnerRole.COMMERCIAL_ADMIN,
    ], async tx => {
      const [partner, societies] = await Promise.all([
        tx.partner.findUnique({
          where: { id: partnerId },
          select: { id: true, displayName: true },
        }),
        tx.society.findMany({
          where: { partnerId },
          select: { id: true, name: true, status: true },
          orderBy: { id: 'asc' },
          take: 51,
        }),
      ]);
      if (!partner) throw new NotFoundException('Partner resource unavailable');
      return {
        partner,
        societies: societies.slice(0, 50),
        hasMore: societies.length > 50,
      };
    });
  }

  /** Only owner/commercial administrator may enumerate partner role labels. */
  members(userId: string, partnerId: string) {
    return this.withVisiblePartner(userId, partnerId, [
      PartnerRole.OWNER, PartnerRole.COMMERCIAL_ADMIN,
    ], tx => tx.partnerMembership.findMany({
      where: { partnerId, active: true },
      select: { id: true, role: true, createdAt: true },
      orderBy: { id: 'asc' },
      take: 50,
    }));
  }
}
