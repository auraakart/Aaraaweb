import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, ProviderSocietyStatus, ProviderVerificationStatus } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PrismaService } from '../prisma/prisma.service';

export type UniversalSearchResult = {
  type: 'MEMBER' | 'VISITOR' | 'INVOICE' | 'HELPDESK' | 'NOTICE' | 'SERVICE' | 'ASSET';
  id: string;
  title: string;
  subtitle?: string | null;
  path: string;
};

export type SearchCapabilities = {
  members: boolean;
  accessSociety: boolean;
  accessOwn: boolean;
  financeSociety: boolean;
  financeOwn: boolean;
  helpdeskSociety: boolean;
  helpdeskOwn: boolean;
  notices: boolean;
  services: boolean;
  assets: boolean;
};

export function universalSearchCapabilities(roles: readonly AppRole[]): SearchCapabilities {
  return {
    members: hasPermission(roles, AppPermission.OCCUPANCY_LIFECYCLE_READ) || hasPermission(roles, AppPermission.SOCIETY_CONFIGURATION_READ),
    accessSociety: hasPermission(roles, AppPermission.GATE_READ),
    accessOwn: hasPermission(roles, AppPermission.ACCESS_READ_OWN) || hasPermission(roles, AppPermission.VISITOR_READ_OWN),
    financeSociety: hasPermission(roles, AppPermission.FINANCE_READ),
    financeOwn: hasPermission(roles, AppPermission.PROPERTY_FINANCE_READ),
    helpdeskSociety: hasPermission(roles, AppPermission.HELPDESK_REVIEW),
    helpdeskOwn: hasPermission(roles, AppPermission.HELPDESK_READ_OWN),
    notices: hasPermission(roles, AppPermission.NOTICE_READ),
    services: hasPermission(roles, AppPermission.SERVICES_MARKETPLACE_USE) || hasPermission(roles, AppPermission.SERVICES_PROVIDER_MANAGE),
    assets: hasPermission(roles, AppPermission.FACILITIES_READ),
  };
}

@Injectable()
export class UniversalSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(societyId: string, userId: string, roles: readonly AppRole[], rawQuery: string, unitId?: string) {
    const query = rawQuery.trim();
    if (query.length < 2 || query.length > 100) throw new BadRequestException('Search query must be between 2 and 100 characters');
    const capabilities = universalSearchCapabilities(roles);
    const needsOwnUnit = !capabilities.accessSociety && capabilities.accessOwn
      || !capabilities.financeSociety && capabilities.financeOwn
      || !capabilities.helpdeskSociety && capabilities.helpdeskOwn;
    if (needsOwnUnit && !unitId) throw new BadRequestException('Selected property unitId is required for resident search');
    if (unitId && needsOwnUnit) await this.assertResidentUnit(societyId, userId, unitId);

    const term = `%${query}%`;
    const results: UniversalSearchResult[] = [];

    if (capabilities.members) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string | null; phone: string; role: string }>>(Prisma.sql`
        SELECT sm."id", u."name", u."phone", sm."role"::text AS "role"
        FROM "SocietyMembership" sm JOIN "User" u ON u."id"=sm."userId"
        WHERE sm."societyId"=${societyId}::uuid AND sm."active"=true
          AND (COALESCE(u."name",'') ILIKE ${term} OR u."phone" ILIKE ${term} OR COALESCE(u."email",'') ILIKE ${term})
        ORDER BY COALESCE(u."name",u."phone") LIMIT 8
      `);
      rows.forEach((row) => results.push({ type: 'MEMBER', id: row.id, title: row.name || row.phone, subtitle: row.role, path: '/residents' }));
    }

    if (capabilities.accessSociety || capabilities.accessOwn) {
      const unitFilter = capabilities.accessSociety
        ? (unitId ? Prisma.sql`AND ar."unitId"=${unitId}::uuid` : Prisma.empty)
        : Prisma.sql`AND ar."unitId"=${unitId!}::uuid`;
      const rows = await this.prisma.$queryRaw<Array<{ id: string; subjectName: string; subjectType: string; status: string }>>(Prisma.sql`
        SELECT ar."id", ar."subjectName", ar."subjectType"::text AS "subjectType", ar."status"::text AS "status"
        FROM "AccessRequest" ar
        WHERE ar."societyId"=${societyId}::uuid ${unitFilter}
          AND (ar."subjectName" ILIKE ${term} OR COALESCE(ar."subjectPhone",'') ILIKE ${term} OR COALESCE(ar."purpose",'') ILIKE ${term})
        ORDER BY ar."createdAt" DESC LIMIT 8
      `);
      rows.forEach((row) => results.push({ type: 'VISITOR', id: row.id, title: row.subjectName, subtitle: `${row.subjectType} · ${row.status}`, path: '/gate' }));
    }

    if (capabilities.financeSociety || capabilities.financeOwn) {
      const scope = capabilities.financeSociety
        ? (unitId ? Prisma.sql`AND i."unitId"=${unitId}::uuid` : Prisma.empty)
        : Prisma.sql`AND i."unitId"=${unitId!}::uuid AND EXISTS (
            SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."unitId"=i."unitId"
              AND uo."userId"=${userId}::uuid AND uo."verified"=true AND uo."active"=true
              AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          )`;
      const rows = await this.prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; billingPeriod: string; unitNumber: string }>>(Prisma.sql`
        SELECT i."id", i."invoiceNumber", i."billingPeriod", u."number" AS "unitNumber"
        FROM "MaintenanceInvoice" i JOIN "Unit" u ON u."id"=i."unitId" AND u."societyId"=i."societyId"
        WHERE i."societyId"=${societyId}::uuid ${scope}
          AND (i."invoiceNumber" ILIKE ${term} OR i."billingPeriod" ILIKE ${term} OR COALESCE(i."description",'') ILIKE ${term} OR u."number" ILIKE ${term})
        ORDER BY i."dueDate" DESC LIMIT 8
      `);
      rows.forEach((row) => results.push({ type: 'INVOICE', id: row.id, title: row.invoiceNumber, subtitle: `${row.billingPeriod} · Unit ${row.unitNumber}`, path: '/billing' }));
    }

    if (capabilities.helpdeskSociety || capabilities.helpdeskOwn) {
      const scope = capabilities.helpdeskSociety
        ? (unitId ? Prisma.sql`AND ht."unitId"=${unitId}::uuid` : Prisma.empty)
        : Prisma.sql`AND ht."unitId"=${unitId!}::uuid AND EXISTS (
            SELECT 1 FROM "UnitOccupancy" uo WHERE uo."societyId"=${societyId}::uuid AND uo."unitId"=ht."unitId"
              AND uo."userId"=${userId}::uuid AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          )`;
      const rows = await this.prisma.$queryRaw<Array<{ id: string; title: string; status: string; category: string | null }>>(Prisma.sql`
        SELECT ht."id", ht."title", ht."status"::text AS "status", ht."category"
        FROM "HelpdeskTicket" ht WHERE ht."societyId"=${societyId}::uuid ${scope}
          AND (ht."title" ILIKE ${term} OR ht."description" ILIKE ${term} OR COALESCE(ht."category",'') ILIKE ${term})
        ORDER BY ht."createdAt" DESC LIMIT 8
      `);
      rows.forEach((row) => results.push({ type: 'HELPDESK', id: row.id, title: row.title, subtitle: row.category ? `${row.category} · ${row.status}` : row.status, path: '/helpdesk' }));
    }

    if (capabilities.notices) {
      const unitTarget = unitId ? Prisma.sql`AND (n."targetUnitId" IS NULL OR n."targetUnitId"=${unitId}::uuid)` : Prisma.empty;
      const rows = await this.prisma.$queryRaw<Array<{ id: string; title: string; category: string | null; importance: string }>>(Prisma.sql`
        SELECT n."id", n."title", n."category", n."importance"::text AS "importance"
        FROM "Notice" n LEFT JOIN "NoticeRecipient" nr
          ON nr."noticeId"=n."id" AND nr."societyId"=n."societyId" AND nr."userId"=${userId}::uuid
        WHERE n."societyId"=${societyId}::uuid AND n."status"='PUBLISHED'
          AND n."publishedAt"<=CURRENT_TIMESTAMP AND (n."expiresAt" IS NULL OR n."expiresAt">CURRENT_TIMESTAMP)
          ${unitTarget}
          AND (n."title" ILIKE ${term} OR n."body" ILIKE ${term} OR COALESCE(n."category",'') ILIKE ${term})
          AND (
            (n."targetBuildingId" IS NULL AND n."targetUnitId" IS NULL AND (
              EXISTS (SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid AND uo."verified"=true AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
              OR (n."audience"='OWNER_AND_OCCUPANTS' AND EXISTS (SELECT 1 FROM "UnitOccupancy" ux WHERE ux."societyId"=${societyId}::uuid AND ux."userId"=${userId}::uuid AND ux."active"=true AND ux."effectiveFrom"<=CURRENT_TIMESTAMP AND (ux."effectiveTo" IS NULL OR ux."effectiveTo">CURRENT_TIMESTAMP)))
            )) OR ((n."targetBuildingId" IS NOT NULL OR n."targetUnitId" IS NOT NULL) AND nr."userId" IS NOT NULL)
          )
        ORDER BY n."publishedAt" DESC LIMIT 8
      `);
      rows.forEach((row) => results.push({ type: 'NOTICE', id: row.id, title: row.title, subtitle: row.category ? `${row.category} · ${row.importance}` : row.importance, path: '/notices' }));
    }

    if (capabilities.services) {
      const offerings = await this.prisma.serviceOffering.findMany({
        where: {
          active: true,
          OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { provider: { businessName: { contains: query, mode: 'insensitive' } } }],
          provider: { active: true, verification: ProviderVerificationStatus.VERIFIED, societies: { some: { societyId, status: ProviderSocietyStatus.APPROVED } } },
        },
        include: { provider: { select: { businessName: true } }, category: { select: { name: true } } },
        orderBy: { name: 'asc' }, take: 8,
      });
      offerings.forEach((row) => results.push({ type: 'SERVICE', id: row.id, title: row.name, subtitle: `${row.provider.businessName} · ${row.category.name}`, path: '/services' }));
    }

    if (capabilities.assets) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; code: string; category: string; location: string | null }>>(Prisma.sql`
        SELECT a."id",a."name",a."code",a."category",a."location" FROM "FacilityAsset" a
        WHERE a."societyId"=${societyId}::uuid AND (a."name" ILIKE ${term} OR a."code" ILIKE ${term} OR a."category" ILIKE ${term} OR COALESCE(a."location",'') ILIKE ${term})
        ORDER BY a."name" LIMIT 8
      `);
      rows.forEach((row) => results.push({ type: 'ASSET', id: row.id, title: row.name, subtitle: row.location ? `${row.code} · ${row.location}` : `${row.code} · ${row.category}`, path: '/facilities' }));
    }

    return { query, unitId: unitId ?? null, results: results.slice(0, 40) };
  }

  private async assertResidentUnit(societyId: string, userId: string, unitId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT x."id" FROM (
        SELECT uo."id" FROM "UnitOccupancy" uo WHERE uo."societyId"=${societyId}::uuid AND uo."unitId"=${unitId}::uuid AND uo."userId"=${userId}::uuid
          AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        UNION ALL
        SELECT ow."id" FROM "UnitOwnership" ow WHERE ow."societyId"=${societyId}::uuid AND ow."unitId"=${unitId}::uuid AND ow."userId"=${userId}::uuid
          AND ow."active"=true AND ow."verified"=true AND ow."effectiveFrom"<=CURRENT_TIMESTAMP AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
      ) x LIMIT 1
    `);
    if (!rows[0]) throw new ForbiddenException('Selected property does not belong to authenticated user');
  }
}
