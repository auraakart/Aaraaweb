import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';

type BroadcastSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
type BroadcastRow = {
  id: string;
  societyId: string;
  incidentId: string | null;
  title: string;
  body: string;
  severity: BroadcastSeverity;
  status: 'PUBLISHED' | 'CANCELLED';
  createdByUserId: string;
  publishedAt: Date;
  createdAt: Date;
};

@Injectable()
export class EmergencyBroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  async publish(
    societyId: string,
    actorUserId: string,
    input: { incidentId?: string; title: string; body: string; severity?: BroadcastSeverity },
  ) {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 3 || title.length > 160) throw new BadRequestException('Broadcast title must be between 3 and 160 characters');
    if (body.length < 5 || body.length > 2000) throw new BadRequestException('Broadcast body must be between 5 and 2000 characters');
    if (input.incidentId) await this.assertOpenIncident(societyId, input.incidentId);
    const severity = input.severity ?? 'HIGH';

    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<BroadcastRow[]>(Prisma.sql`
        INSERT INTO "EmergencyBroadcast" (
          "societyId", "incidentId", "title", "body", "severity", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid,
          ${input.incidentId ?? null}::uuid,
          ${title},
          ${body},
          ${severity},
          ${actorUserId}::uuid
        )
        RETURNING *
      `);
      const broadcast = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "EmergencyBroadcastRecipient" ("societyId", "broadcastId", "userId")
        SELECT ${societyId}::uuid, ${broadcast.id}::uuid, recipient."userId"
        FROM (
          SELECT DISTINCT sm."userId"
          FROM "SocietyMembership" sm
          JOIN "User" u ON u."id" = sm."userId"
          WHERE sm."societyId" = ${societyId}::uuid
            AND sm."active" = true
            AND sm."role" <> 'VENDOR'::"MembershipRole"
            AND u."status" = 'ACTIVE'::"UserStatus"
        ) recipient
      `);
      const recipients = await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
        SELECT "userId"
        FROM "EmergencyBroadcastRecipient"
        WHERE "societyId" = ${societyId}::uuid AND "broadcastId" = ${broadcast.id}::uuid
      `);
      return { broadcast, recipients };
    });

    const createdAt = result.broadcast.publishedAt.toISOString();
    result.recipients.forEach(({ userId }) => this.realtime.publishResident({
      type: 'EMERGENCY_BROADCAST',
      societyId,
      userId,
      broadcastId: result.broadcast.id,
      incidentId: result.broadcast.incidentId ?? undefined,
      severity: result.broadcast.severity,
      title: result.broadcast.title,
      body: result.broadcast.body,
      createdAt,
    }));
    return { ...result.broadcast, recipientCount: result.recipients.length, acknowledgedCount: 0 };
  }

  listMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT eb.*, ebr."acknowledgedAt"
      FROM "EmergencyBroadcastRecipient" ebr
      JOIN "EmergencyBroadcast" eb ON eb."id" = ebr."broadcastId"
      WHERE ebr."societyId" = ${societyId}::uuid
        AND ebr."userId" = ${userId}::uuid
        AND eb."status" = 'PUBLISHED'
      ORDER BY eb."publishedAt" DESC
      LIMIT 100
    `);
  }

  listManage(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT eb.*,
             COUNT(ebr."id")::int AS "recipientCount",
             COUNT(ebr."acknowledgedAt")::int AS "acknowledgedCount"
      FROM "EmergencyBroadcast" eb
      LEFT JOIN "EmergencyBroadcastRecipient" ebr
        ON ebr."broadcastId" = eb."id" AND ebr."societyId" = eb."societyId"
      WHERE eb."societyId" = ${societyId}::uuid
      GROUP BY eb."id"
      ORDER BY eb."publishedAt" DESC
      LIMIT 100
    `);
  }

  async acknowledge(societyId: string, userId: string, broadcastId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; acknowledgedAt: Date }>>(Prisma.sql`
      UPDATE "EmergencyBroadcastRecipient" ebr
      SET "acknowledgedAt" = COALESCE(ebr."acknowledgedAt", CURRENT_TIMESTAMP)
      FROM "EmergencyBroadcast" eb
      WHERE ebr."broadcastId" = ${broadcastId}::uuid
        AND ebr."societyId" = ${societyId}::uuid
        AND ebr."userId" = ${userId}::uuid
        AND eb."id" = ebr."broadcastId"
        AND eb."societyId" = ${societyId}::uuid
        AND eb."status" = 'PUBLISHED'
      RETURNING ebr."id", ebr."acknowledgedAt"
    `);
    if (!rows[0]) throw new NotFoundException('Emergency broadcast not found for the authenticated recipient');
    return rows[0];
  }

  private async assertOpenIncident(societyId: string, incidentId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "SosIncident"
      WHERE "id" = ${incidentId}::uuid
        AND "societyId" = ${societyId}::uuid
        AND "status" IN ('ACTIVE','ACKNOWLEDGED')
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Emergency broadcast incident must be active in the current society');
  }
}