import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerRole, Prisma } from '@prisma/client';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V5.4.4 read-only partner control plane. A partner role is NOT an AppRole,
 * SocietyMembership, permission grant, license or right to operational PII.
 * Requester identity always comes from the bearer-authenticated session.
 */
@Injectable()
export class PartnerPortfolioReadService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService = new EntitlementService(prisma)) {}

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
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

  /** Separate operational audience and current society roles; commercial access alone is insufficient. */
  operations(userId: string, partnerId: string, audience?: 'PARTNER') {
    if (audience === 'PARTNER') throw new ForbiddenException('Use a society-authorised Admin session for operational summaries');
    return this.withVisiblePartner(userId, partnerId, [PartnerRole.OWNER, PartnerRole.BRAND_MANAGER, PartnerRole.COMMERCIAL_ADMIN], async tx => {
      const memberships = await tx.societyMembership.findMany({
        where: {userId, active: true, society: {is: {partnerId, status: 'ACTIVE'}}},
        select: {societyId: true, role: true},
      });
      const roles = new Map<string, AppRole[]>();
      for (const member of memberships) roles.set(member.societyId, [...roles.get(member.societyId) ?? [], member.role as AppRole]);
      const eligible = [...roles].filter(([, values]) => [AppPermission.FINANCE_READ, AppPermission.HELPDESK_REVIEW, AppPermission.FACILITIES_READ].some(p => hasPermission(values, p))).map(([id]) => id);
      const societies = await tx.society.findMany({where: {partnerId, status: 'ACTIVE', id: {in: eligible}}, select: {id: true, name: true}, orderBy: {id: 'asc'}, take: 51});
      const summaries = [];
      for (const society of societies.slice(0, 50)) {
        const currentRoles = roles.get(society.id)!;
        const features=(await this.entitlements.current(society.id,tx))?.enabledFeatures??[];
        await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id', ${society.id}, true)`);
        let finance: {outstandingPaise: string; overdueReceivables: number} | null = null;
        let helpdesk: {openTickets: number; overdueTickets: number} | null = null;
        let facilities: {openWorkOrders: number; overdueWorkOrders: number} | null = null;
        if (hasPermission(currentRoles, AppPermission.FINANCE_READ) && features.includes(ProductFeature.SOCIETY_ACCOUNTING)) {
          [finance] = await tx.$queryRaw<Array<NonNullable<typeof finance>>>(Prisma.sql`
            WITH balances AS (
              SELECT r."dueDate", r."amountPaise"
                + COALESCE((SELECT SUM(CASE WHEN a."type"='DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END)
                    FROM "ReceivableAdjustment" a WHERE a."societyId"=r."societyId" AND a."receivableId"=r."id"),0)
                - COALESCE((SELECT SUM(a."amountPaise") FROM "ReceivableAllocation" a WHERE a."societyId"=r."societyId" AND a."receivableId"=r."id"),0)
                + COALESCE((SELECT SUM(v."amountPaise") FROM "ReceivableAllocationReversal" v JOIN "ReceivableAllocation" a ON a."id"=v."allocationId" AND a."societyId"=v."societyId"
                    WHERE a."societyId"=r."societyId" AND a."receivableId"=r."id"),0) AS outstanding
              FROM "Receivable" r WHERE r."societyId"=${society.id}::uuid AND r."status"<>'VOID'
            ) SELECT COALESCE(SUM(GREATEST(outstanding,0)),0)::text AS "outstandingPaise",
              COUNT(*) FILTER (WHERE outstanding>0 AND "dueDate"<CURRENT_DATE)::int AS "overdueReceivables" FROM balances
          `);
        }
        if (hasPermission(currentRoles, AppPermission.HELPDESK_REVIEW) && features.includes(ProductFeature.HELPDESK)) {
          [helpdesk] = await tx.$queryRaw<Array<NonNullable<typeof helpdesk>>>(Prisma.sql`
            SELECT COUNT(*)::int AS "openTickets",
              COUNT(*) FILTER (WHERE ("firstRespondedAt" IS NULL AND "firstResponseDueAt"<CURRENT_TIMESTAMP) OR "resolutionDueAt"<CURRENT_TIMESTAMP)::int AS "overdueTickets"
            FROM "HelpdeskTicket" WHERE "societyId"=${society.id}::uuid AND "status" NOT IN ('RESOLVED','CLOSED')
          `);
        }
        if (hasPermission(currentRoles, AppPermission.FACILITIES_READ)) {
          [facilities] = await tx.$queryRaw<Array<NonNullable<typeof facilities>>>(Prisma.sql`
            SELECT COUNT(*)::int AS "openWorkOrders", COUNT(*) FILTER (WHERE "dueAt"<CURRENT_TIMESTAMP)::int AS "overdueWorkOrders"
            FROM "FacilityWorkOrder" WHERE "societyId"=${society.id}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')
          `);
        }
        summaries.push({societyId: society.id, societyName: society.name, finance, helpdesk, facilities});
      }
      return {partnerId, societies: summaries, hasMore: societies.length>50, generatedAt: new Date().toISOString()};
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
