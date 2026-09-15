import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PrismaService } from '../prisma/prisma.service';

type SosSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

@Injectable()
export class SosRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  listPolicies(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, responder."name" AS "responderName"
      FROM "SosRoutingPolicy" p
      JOIN "User" responder ON responder."id"=p."responderUserId"
      WHERE p."societyId"=${societyId}::uuid
      ORDER BY CASE p."severity" WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END
    `);
  }

  async listCandidates(societyId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string; name: string | null; role: string }>>(Prisma.sql`
      SELECT sm."userId", u."name", sm."role"::text AS role
      FROM "SocietyMembership" sm
      JOIN "User" u ON u."id"=sm."userId"
      WHERE sm."societyId"=${societyId}::uuid AND sm."active"=true
      ORDER BY u."name" NULLS LAST, sm."userId"
    `);
    const grouped = new Map<string, { userId: string; name: string | null; roles: AppRole[] }>();
    for (const row of rows) {
      const existing = grouped.get(row.userId) ?? { userId: row.userId, name: row.name, roles: [] };
      existing.roles.push(row.role as AppRole);
      grouped.set(row.userId, existing);
    }
    return [...grouped.values()]
      .filter((candidate) => hasPermission(candidate.roles, AppPermission.SOS_RESPOND))
      .map((candidate) => ({ ...candidate, roles: candidate.roles.map(String) }));
  }

  async upsertPolicy(
    societyId: string,
    actorUserId: string,
    input: { severity: SosSeverity; acknowledgeWithinMinutes: number; responderUserId: string; active?: boolean },
  ) {
    if (input.acknowledgeWithinMinutes < 1 || input.acknowledgeWithinMinutes > 1440) {
      throw new BadRequestException('SOS acknowledgement deadline must be between 1 and 1440 minutes');
    }
    const memberships = await this.prisma.societyMembership.findMany({
      where: { societyId, userId: input.responderUserId, active: true },
      select: { role: true },
    });
    const roles = memberships.map((membership) => membership.role as unknown as AppRole);
    if (!hasPermission(roles, AppPermission.SOS_RESPOND)) {
      throw new BadRequestException('SOS routing responder must have SOS response permission in the current society');
    }
    const [policy] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "SosRoutingPolicy" (
        "societyId","severity","acknowledgeWithinMinutes","responderUserId","active","updatedByUserId"
      ) VALUES (
        ${societyId}::uuid,${input.severity},${input.acknowledgeWithinMinutes},${input.responderUserId}::uuid,
        ${input.active ?? true},${actorUserId}::uuid
      )
      ON CONFLICT ("societyId","severity") DO UPDATE SET
        "acknowledgeWithinMinutes"=EXCLUDED."acknowledgeWithinMinutes",
        "responderUserId"=EXCLUDED."responderUserId",
        "active"=EXCLUDED."active",
        "updatedByUserId"=EXCLUDED."updatedByUserId",
        "updatedAt"=CURRENT_TIMESTAMP
      RETURNING *
    `);
    return policy;
  }

  async history(societyId: string, incidentId: string) {
    const [incident] = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SosIncident"
      WHERE "id"=${incidentId}::uuid AND "societyId"=${societyId}::uuid
      LIMIT 1
    `);
    if (!incident) throw new NotFoundException('SOS incident not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT se.*,
        CASE WHEN se."actorSource"='AUTOMATION' THEN 'Aaraagate automation' ELSE COALESCE(actor."name", 'Unknown user') END AS "actorName"
      FROM "SosIncidentEvent" se
      LEFT JOIN "User" actor ON actor."id"=se."actorUserId"
      WHERE se."societyId"=${societyId}::uuid AND se."incidentId"=${incidentId}::uuid
      ORDER BY se."occurredAt" ASC
    `);
  }
}
