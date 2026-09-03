import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';

type NoticeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

type NoticeRow = {
  id: string;
  societyId: string;
  createdById: string;
  title: string;
  body: string;
  category: string | null;
  audience: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS';
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
    return this.prisma.$queryRaw<NoticeRow[]>(Prisma.sql`
      SELECT n.*
      FROM "Notice" n
      WHERE n."societyId" = ${societyId}::uuid
        AND n."status" = 'PUBLISHED'
        AND n."publishedAt" <= CURRENT_TIMESTAMP
        AND (n."expiresAt" IS NULL OR n."expiresAt" > CURRENT_TIMESTAMP)
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
      ORDER BY n."publishedAt" DESC, n."createdAt" DESC
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
    input: { title: string; body: string; category?: string; expiresAt?: string; audience?: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS' },
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

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<NoticeRow[]>(Prisma.sql`
        INSERT INTO "Notice" ("societyId", "createdById", "title", "body", "category", "expiresAt", "audience")
        VALUES (${societyId}::uuid, ${actorUserId}::uuid, ${title}, ${body}, ${category}, ${expiresAt}, ${input.audience ?? 'OWNER_AND_OCCUPANTS'}::"NoticeAudience")
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
        INSERT INTO "NoticeEvent" ("societyId", "noticeId", "actorUserId", "action", "fromStatus", "toStatus")
        VALUES (${societyId}::uuid, ${noticeId}::uuid, ${actorUserId}::uuid, 'PUBLISHED', 'DRAFT', 'PUBLISHED')
      `);
      return published;
    });
    if (this.realtime) {
      const recipients = await this.broadcastRecipients(societyId, updated.audience);
      recipients.forEach(({ userId }) => this.realtime?.publishResident({
        type: 'GENERAL_NOTICE_PUBLISHED', societyId, userId, noticeId: updated.id,
        title: updated.title, body: updated.body, createdAt: new Date().toISOString(),
      }));
    }
    return updated;
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

  private broadcastRecipients(societyId: string, audience: NoticeRow['audience']) {
    return this.prisma.$queryRaw<{ userId: string }[]>(Prisma.sql`
      SELECT "userId" FROM "UnitOwnership"
      WHERE "societyId"=${societyId}::uuid AND "verified"=true AND "active"=true
        AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
      UNION
      SELECT "userId" FROM "UnitOccupancy"
      WHERE ${audience}='OWNER_AND_OCCUPANTS' AND "societyId"=${societyId}::uuid AND "active"=true
        AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
    `);
  }
}
