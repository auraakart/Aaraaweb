import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NoticeTargetingService {
  constructor(private readonly prisma: PrismaService) {}

  async setTarget(
    societyId: string,
    actorUserId: string,
    noticeId: string,
    input: { buildingId?: string | null; unitId?: string | null },
  ) {
    const buildingId = input.buildingId || null;
    const unitId = input.unitId || null;
    if (buildingId && unitId) throw new BadRequestException('Notice can target either a building or a unit, not both');

    return this.prisma.$transaction(async (tx) => {
      const [notice] = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id","status"
        FROM "Notice"
        WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!notice) throw new NotFoundException('Notice not found');
      if (notice.status !== 'DRAFT') throw new BadRequestException('Only draft notices can change targeting');

      if (buildingId) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Building"
          WHERE "id"=${buildingId}::uuid AND "societyId"=${societyId}::uuid
          LIMIT 1
        `);
        if (!rows[0]) throw new BadRequestException('Target building must belong to the current society');
      }

      if (unitId) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Unit"
          WHERE "id"=${unitId}::uuid AND "societyId"=${societyId}::uuid
          LIMIT 1
        `);
        if (!rows[0]) throw new BadRequestException('Target unit must belong to the current society');
      }

      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "Notice"
        SET "targetBuildingId"=${buildingId}::uuid,
            "targetUnitId"=${unitId}::uuid,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Notice changed; refresh and retry');

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId","noticeId","actorUserId","action","fromStatus","toStatus")
        VALUES (${societyId}::uuid,${noticeId}::uuid,${actorUserId}::uuid,'TARGET_UPDATED','DRAFT','DRAFT')
      `);

      return updated;
    });
  }
}
