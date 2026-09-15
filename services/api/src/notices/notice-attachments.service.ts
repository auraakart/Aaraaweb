import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NoticeAttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async attach(societyId: string, actorUserId: string, noticeId: string, documentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [notice] = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id","status" FROM "Notice"
        WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!notice) throw new NotFoundException('Notice not found');
      if (notice.status !== 'DRAFT') throw new BadRequestException('Attachments can only be changed on draft notices');

      const [document] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "SocietyDocument"
        WHERE "id"=${documentId}::uuid AND "societyId"=${societyId}::uuid
          AND "status"='PUBLISHED' AND "audience"='ALL_MEMBERS'
        LIMIT 1
      `);
      if (!document) throw new BadRequestException('Attachment must be a published all-member document in the current society');

      const [attachment] = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "NoticeDocumentAttachment" ("societyId","noticeId","documentId","attachedByUserId")
        VALUES (${societyId}::uuid,${noticeId}::uuid,${documentId}::uuid,${actorUserId}::uuid)
        ON CONFLICT ("noticeId","documentId") DO NOTHING
        RETURNING *
      `);
      if (!attachment) return { noticeId, documentId, alreadyAttached: true };

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId","noticeId","actorUserId","action","fromStatus","toStatus")
        VALUES (${societyId}::uuid,${noticeId}::uuid,${actorUserId}::uuid,'ATTACHMENT_ADDED','DRAFT','DRAFT')
      `);
      return attachment;
    });
  }

  async detach(societyId: string, actorUserId: string, noticeId: string, documentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [notice] = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id","status" FROM "Notice"
        WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!notice) throw new NotFoundException('Notice not found');
      if (notice.status !== 'DRAFT') throw new BadRequestException('Attachments can only be changed on draft notices');

      const removed = await tx.$executeRaw(Prisma.sql`
        DELETE FROM "NoticeDocumentAttachment"
        WHERE "societyId"=${societyId}::uuid AND "noticeId"=${noticeId}::uuid AND "documentId"=${documentId}::uuid
      `);
      if (removed > 0) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "NoticeEvent" ("societyId","noticeId","actorUserId","action","fromStatus","toStatus")
          VALUES (${societyId}::uuid,${noticeId}::uuid,${actorUserId}::uuid,'ATTACHMENT_REMOVED','DRAFT','DRAFT')
        `);
      }
      return { noticeId, documentId, removed: removed > 0 };
    });
  }

  listManage(societyId: string, noticeId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT a."documentId",d."title",d."fileName",d."mimeType",d."sizeBytes"::text AS "sizeBytes",d."version",d."status",a."createdAt"
      FROM "NoticeDocumentAttachment" a
      JOIN "SocietyDocument" d ON d."id"=a."documentId" AND d."societyId"=a."societyId"
      WHERE a."societyId"=${societyId}::uuid AND a."noticeId"=${noticeId}::uuid
      ORDER BY a."createdAt" ASC
    `);
  }

  async listForResident(societyId: string, userId: string, noticeId: string) {
    const visible = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT n."id" FROM "Notice" n
      LEFT JOIN "NoticeRecipient" nr
        ON nr."noticeId"=n."id" AND nr."societyId"=n."societyId" AND nr."userId"=${userId}::uuid
      WHERE n."id"=${noticeId}::uuid AND n."societyId"=${societyId}::uuid
        AND n."status"='PUBLISHED' AND n."publishedAt"<=CURRENT_TIMESTAMP
        AND (n."expiresAt" IS NULL OR n."expiresAt">CURRENT_TIMESTAMP)
        AND (
          ((n."targetBuildingId" IS NOT NULL OR n."targetUnitId" IS NOT NULL) AND nr."userId" IS NOT NULL)
          OR
          (n."targetBuildingId" IS NULL AND n."targetUnitId" IS NULL AND (
            EXISTS (
              SELECT 1 FROM "UnitOwnership" uo
              WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
                AND uo."verified"=true AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
            )
            OR (n."audience"='OWNER_AND_OCCUPANTS' AND EXISTS (
              SELECT 1 FROM "UnitOccupancy" ur
              WHERE ur."societyId"=${societyId}::uuid AND ur."userId"=${userId}::uuid
                AND ur."active"=true AND ur."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (ur."effectiveTo" IS NULL OR ur."effectiveTo">CURRENT_TIMESTAMP)
            ))
          ))
        )
      LIMIT 1
    `);
    if (!visible[0]) throw new NotFoundException('Published notice not found');

    return this.prisma.$queryRaw(Prisma.sql`
      SELECT a."documentId",d."title",d."fileName",d."mimeType",d."sizeBytes"::text AS "sizeBytes",d."version"
      FROM "NoticeDocumentAttachment" a
      JOIN "SocietyDocument" d ON d."id"=a."documentId" AND d."societyId"=a."societyId"
      WHERE a."societyId"=${societyId}::uuid AND a."noticeId"=${noticeId}::uuid
        AND d."status"='PUBLISHED' AND d."audience"='ALL_MEMBERS'
      ORDER BY a."createdAt" ASC
    `);
  }
}
