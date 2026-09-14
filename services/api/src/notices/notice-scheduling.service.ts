import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SchedulableNotice = {
  id: string;
  audience: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  expiresAt: Date | null;
};

@Injectable()
export class NoticeSchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async schedule(
    societyId: string,
    actorUserId: string,
    noticeId: string,
    publishAtInput: string,
    expiresAtInput?: string,
  ) {
    const publishAt = new Date(publishAtInput);
    if (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled publication time must be in the future');
    }

    const requestedExpiry = expiresAtInput ? new Date(expiresAtInput) : null;
    if (requestedExpiry && (!Number.isFinite(requestedExpiry.getTime()) || requestedExpiry <= publishAt)) {
      throw new BadRequestException('Notice expiry must be after scheduled publication time');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<SchedulableNotice[]>(Prisma.sql`
        SELECT "id", "audience", "status", "expiresAt"
        FROM "Notice"
        WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Notice not found');
      if (current.status !== 'DRAFT') throw new BadRequestException('Only draft notices can be scheduled');

      const expiresAt = requestedExpiry ?? current.expiresAt;
      if (expiresAt && expiresAt <= publishAt) {
        throw new BadRequestException('Notice expiry must be after scheduled publication time');
      }

      const updatedRows = await tx.$queryRaw(Prisma.sql`
        UPDATE "Notice"
        SET "status"='PUBLISHED', "publishedAt"=${publishAt}, "expiresAt"=${expiresAt}, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
        RETURNING *
      `);
      const updated = Array.isArray(updatedRows) ? updatedRows[0] : undefined;
      if (!updated) throw new BadRequestException('Notice changed; refresh and retry');

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeRecipient" ("societyId", "noticeId", "userId", "recipientType")
        SELECT ${societyId}::uuid, ${noticeId}::uuid, uo."userId", 'OWNER'
        FROM "UnitOwnership" uo
        WHERE uo."societyId"=${societyId}::uuid AND uo."verified"=true AND uo."active"=true
          AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        GROUP BY uo."userId"
        ON CONFLICT ("noticeId", "userId") DO NOTHING
      `);

      if (current.audience === 'OWNER_AND_OCCUPANTS') {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "NoticeRecipient" ("societyId", "noticeId", "userId", "recipientType")
          SELECT ${societyId}::uuid, ${noticeId}::uuid, ur."userId", 'OCCUPANT'
          FROM "UnitOccupancy" ur
          WHERE ur."societyId"=${societyId}::uuid AND ur."active"=true
            AND ur."effectiveFrom"<=CURRENT_TIMESTAMP AND (ur."effectiveTo" IS NULL OR ur."effectiveTo">CURRENT_TIMESTAMP)
          GROUP BY ur."userId"
          ON CONFLICT ("noticeId", "userId") DO NOTHING
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId", "noticeId", "actorUserId", "action", "fromStatus", "toStatus")
        VALUES (${societyId}::uuid, ${noticeId}::uuid, ${actorUserId}::uuid, 'PUBLISHED', 'DRAFT', 'PUBLISHED')
      `);

      return updated;
    });
  }
}
