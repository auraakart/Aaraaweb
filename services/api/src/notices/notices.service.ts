import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';

type NoticeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type NoticeImportance = 'NORMAL' | 'IMPORTANT' | 'CRITICAL';

type NoticeRow = {
  id: string;
  societyId: string;
  createdById: string;
  title: string;
  body: string;
  category: string | null;
  audience: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS';
  importance: NoticeImportance;
  requiresAcknowledgement: boolean;
  status: NoticeStatus;
  publishedAt: Date | null;
  expiresAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService, private readonly realtime?: NotificationRealtimeService) {}

  listPublished(societyId: string, userId: string) {
    return this.prisma.$queryRaw<(NoticeRow & { readAt: Date | null; acknowledgedAt: Date | null })[]>(Prisma.sql`
      SELECT n.*, nr."readAt", nr."acknowledgedAt"
      FROM "Notice" n
      LEFT JOIN "NoticeRecipient" nr
        ON nr."noticeId" = n."id" AND nr."societyId" = n."societyId" AND nr."userId" = ${userId}::uuid
      WHERE n."societyId" = ${societyId}::uuid
        AND n."status" = 'PUBLISHED'
        AND n."publishedAt" <= CURRENT_TIMESTAMP
        AND (n."expiresAt" IS NULL OR n."expiresAt" > CURRENT_TIMESTAMP)
        AND (
          (
            n."targetBuildingId" IS NULL AND n."targetUnitId" IS NULL
            AND (
              EXISTS (
                SELECT 1 FROM "UnitOwnership" uo
                WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
                  AND uo."verified"=true AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
                  AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
              ) OR (n."audience"='OWNER_AND_OCCUPANTS' AND EXISTS (
                SELECT 1 FROM "UnitOccupancy" ur
                WHERE ur."societyId"=${societyId}::uuid AND ur."userId"=${userId}::uuid
                  AND ur."active"=true AND ur."effectiveFrom"<=CURRENT_TIMESTAMP
                  AND (ur."effectiveTo" IS NULL OR ur."effectiveTo">CURRENT_TIMESTAMP)
              ))
            )
          )
          OR (
            (n."targetBuildingId" IS NOT NULL OR n."targetUnitId" IS NOT NULL)
            AND nr."userId" IS NOT NULL
          )
        )
      ORDER BY
        CASE n."importance" WHEN 'CRITICAL' THEN 0 WHEN 'IMPORTANT' THEN 1 ELSE 2 END,
        n."publishedAt" DESC,
        n."createdAt" DESC
    `);
  }

  listManage(societyId: string) {
    return this.prisma.$queryRaw<NoticeRow[]>(Prisma.sql`
      SELECT n.*
      FROM "Notice" n
      WHERE n."societyId" = ${societyId}::uuid
      ORDER BY n."createdAt" DESC
    `);
  }

  async createDraft(
    societyId: string,
    actorUserId: string,
    input: {
      title: string;
      body: string;
      category?: string;
      expiresAt?: string;
      audience?: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS';
      importance?: NoticeImportance;
      requiresAcknowledgement?: boolean;
    },
  ) {
    const title = input.title.trim();
    const body = input.body.trim();
    const category = input.category?.trim() || null;
    if (title.length < 3 || title.length > 160) throw new BadRequestException('Title must be between 3 and 160 characters');
    if (body.length < 5 || body.length > 5000) throw new BadRequestException('Body must be between 5 and 5000 characters');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      throw new BadRequestException('Expiry must be in the future');
    }
    const importance = input.importance ?? 'NORMAL';
    const requiresAcknowledgement = input.requiresAcknowledgement ?? importance === 'CRITICAL';
    if (importance === 'CRITICAL' && !requiresAcknowledgement) {
      throw new BadRequestException('Critical notices must require acknowledgement');
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<NoticeRow[]>(Prisma.sql`
        INSERT INTO "Notice" (
          "societyId", "createdById", "title", "body", "category", "expiresAt", "audience", "importance", "requiresAcknowledgement"
        ) VALUES (
          ${societyId}::uuid, ${actorUserId}::uuid, ${title}, ${body}, ${category}, ${expiresAt},
          ${input.audience ?? 'OWNER_AND_OCCUPANTS'}::"NoticeAudience", ${importance}, ${requiresAcknowledgement}
        )
        RETURNING *
      `);
      const notice = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId", "noticeId", "actorUserId", "action", "toStatus")
        VALUES (${societyId}::uuid, ${notice.id}::uuid, ${actorUserId}::uuid, 'CREATED', 'DRAFT')
      `);
      return notice;
    });
  }

  async publish(societyId: string, actorUserId: string, noticeId: string, expiresAtInput?: string) {
    const current = await this.findNotice(societyId, noticeId);
    if (!current) throw new NotFoundException('Notice not found');
    if (current.status === 'ARCHIVED') throw new BadRequestException('Archived notice cannot be published');
    if (current.status === 'PUBLISHED') return current;
    const expiresAt = expiresAtInput ? new Date(expiresAtInput) : current.expiresAt;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      throw new BadRequestException('Expiry must be in the future');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<NoticeRow[]>(Prisma.sql`
        UPDATE "Notice"
        SET "status" = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP, "expiresAt" = ${expiresAt}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${noticeId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = 'DRAFT'
        RETURNING *
      `);
      const published = rows[0];
      if (!published) throw new BadRequestException('Notice changed; refresh and retry');

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeRecipient" ("societyId", "noticeId", "userId", "recipientType")
        SELECT ${societyId}::uuid, ${noticeId}::uuid, uo."userId", 'OWNER'
        FROM "UnitOwnership" uo
        WHERE uo."societyId"=${societyId}::uuid AND uo."verified"=true AND uo."active"=true
          AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        GROUP BY uo."userId"
        ON CONFLICT ("noticeId", "userId") DO NOTHING
      `);

      if (published.audience === 'OWNER_AND_OCCUPANTS') {
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
      return published;
    });

    if (this.realtime) {
      const recipients = await this.snapshotRecipients(societyId, noticeId);
      recipients.forEach(({ userId }) => this.realtime?.publishResident({
        type: 'GENERAL_NOTICE_PUBLISHED', societyId, userId, noticeId: updated.id,
        title: updated.title, body: updated.body, createdAt: new Date().toISOString(),
      }));
    }
    return updated;
  }

  async markRead(societyId: string, userId: string, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ noticeId: string; readAt: Date | null; acknowledgedAt: Date | null }>>(Prisma.sql`
        UPDATE "NoticeRecipient" nr
        SET "readAt" = COALESCE(nr."readAt", CURRENT_TIMESTAMP)
        FROM "Notice" n
        WHERE nr."noticeId" = n."id"
          AND nr."noticeId"=${noticeId}::uuid
          AND nr."societyId"=${societyId}::uuid
          AND nr."userId"=${userId}::uuid
          AND n."societyId"=${societyId}::uuid
          AND n."status"='PUBLISHED'
        RETURNING nr."noticeId", nr."readAt", nr."acknowledgedAt"
      `);
      const recipient = rows[0];
      if (!recipient) throw new NotFoundException('Published notice is not assigned to current user');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId", "noticeId", "actorUserId", "action", "toStatus")
        VALUES (${societyId}::uuid, ${noticeId}::uuid, ${userId}::uuid, 'READ', 'PUBLISHED')
      `);
      return recipient;
    });
  }

  async acknowledge(societyId: string, userId: string, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ noticeId: string; readAt: Date | null; acknowledgedAt: Date | null }>>(Prisma.sql`
        UPDATE "NoticeRecipient" nr
        SET "readAt" = COALESCE(nr."readAt", CURRENT_TIMESTAMP),
            "acknowledgedAt" = COALESCE(nr."acknowledgedAt", CURRENT_TIMESTAMP)
        FROM "Notice" n
        WHERE nr."noticeId" = n."id"
          AND nr."noticeId"=${noticeId}::uuid
          AND nr."societyId"=${societyId}::uuid
          AND nr."userId"=${userId}::uuid
          AND n."societyId"=${societyId}::uuid
          AND n."status"='PUBLISHED'
          AND n."requiresAcknowledgement"=true
        RETURNING nr."noticeId", nr."readAt", nr."acknowledgedAt"
      `);
      const recipient = rows[0];
      if (!recipient) throw new BadRequestException('Notice is not assigned to current user or does not require acknowledgement');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId", "noticeId", "actorUserId", "action", "toStatus")
        VALUES (${societyId}::uuid, ${noticeId}::uuid, ${userId}::uuid, 'ACKNOWLEDGED', 'PUBLISHED')
      `);
      return recipient;
    });
  }

  async acknowledgementSummary(societyId: string, noticeId: string) {
    const notice = await this.findNotice(societyId, noticeId);
    if (!notice) throw new NotFoundException('Notice not found');
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint; read: bigint; acknowledged: bigint }>>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE "readAt" IS NOT NULL)::bigint AS read,
        COUNT(*) FILTER (WHERE "acknowledgedAt" IS NOT NULL)::bigint AS acknowledged
      FROM "NoticeRecipient"
      WHERE "societyId"=${societyId}::uuid AND "noticeId"=${noticeId}::uuid
    `);
    const row = rows[0] ?? { total: 0n, read: 0n, acknowledged: 0n };
    return {
      noticeId,
      requiresAcknowledgement: notice.requiresAcknowledgement,
      totalRecipients: Number(row.total),
      readRecipients: Number(row.read),
      acknowledgedRecipients: Number(row.acknowledged),
      pendingAcknowledgement: notice.requiresAcknowledgement ? Number(row.total - row.acknowledged) : 0,
    };
  }

  async archive(societyId: string, actorUserId: string, noticeId: string) {
    const current = await this.findNotice(societyId, noticeId);
    if (!current) throw new NotFoundException('Notice not found');
    if (current.status === 'ARCHIVED') return current;

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<NoticeRow[]>(Prisma.sql`
        UPDATE "Notice"
        SET "status" = 'ARCHIVED', "archivedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${noticeId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = ${current.status}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Notice changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "NoticeEvent" ("societyId", "noticeId", "actorUserId", "action", "fromStatus", "toStatus")
        VALUES (${societyId}::uuid, ${noticeId}::uuid, ${actorUserId}::uuid, 'ARCHIVED', ${current.status}, 'ARCHIVED')
      `);
      return updated;
    });
  }

  async history(societyId: string, noticeId: string) {
    const current = await this.findNotice(societyId, noticeId);
    if (!current) throw new NotFoundException('Notice not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT ne.*, actor."name" AS "actorName"
      FROM "NoticeEvent" ne
      JOIN "User" actor ON actor."id" = ne."actorUserId"
      WHERE ne."societyId" = ${societyId}::uuid AND ne."noticeId" = ${noticeId}::uuid
      ORDER BY ne."occurredAt" ASC
    `);
  }

  private async findNotice(societyId: string, noticeId: string) {
    const rows = await this.prisma.$queryRaw<NoticeRow[]>(Prisma.sql`
      SELECT * FROM "Notice"
      WHERE "id" = ${noticeId}::uuid AND "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private snapshotRecipients(societyId: string, noticeId: string) {
    return this.prisma.$queryRaw<{ userId: string }[]>(Prisma.sql`
      SELECT "userId" FROM "NoticeRecipient"
      WHERE "societyId"=${societyId}::uuid AND "noticeId"=${noticeId}::uuid
    `);
  }
}
