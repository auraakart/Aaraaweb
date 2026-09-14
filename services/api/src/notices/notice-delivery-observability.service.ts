import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type NoticeMeta = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: Date | null;
  expiresAt: Date | null;
  requiresAcknowledgement: boolean;
};

type DeliveryAggregate = {
  totalRecipients: bigint;
  readRecipients: bigint;
  acknowledgedRecipients: bigint;
  pendingHandoff: bigint;
  inFlightHandoff: bigint;
  successfulHandoff: bigint;
  retryingHandoff: bigint;
  attemptedRecipients: bigint;
  totalAttempts: bigint;
};

@Injectable()
export class NoticeDeliveryObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(societyId: string, noticeId: string) {
    const notices = await this.prisma.$queryRaw<NoticeMeta[]>(Prisma.sql`
      SELECT "id", "status", "publishedAt", "expiresAt", "requiresAcknowledgement"
      FROM "Notice"
      WHERE "id"=${noticeId}::uuid AND "societyId"=${societyId}::uuid
      LIMIT 1
    `);
    const notice = notices[0];
    if (!notice) throw new NotFoundException('Notice not found');

    const rows = await this.prisma.$queryRaw<DeliveryAggregate[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT nr."userId")::bigint AS "totalRecipients",
        COUNT(DISTINCT nr."userId") FILTER (WHERE nr."readAt" IS NOT NULL)::bigint AS "readRecipients",
        COUNT(DISTINCT nr."userId") FILTER (WHERE nr."acknowledgedAt" IS NOT NULL)::bigint AS "acknowledgedRecipients",
        COUNT(DISTINCT nd."userId") FILTER (WHERE nd."status"='PENDING' AND nd."attemptCount"=0)::bigint AS "pendingHandoff",
        COUNT(DISTINCT nd."userId") FILTER (WHERE nd."status"='IN_FLIGHT')::bigint AS "inFlightHandoff",
        COUNT(DISTINCT nd."userId") FILTER (WHERE nd."status"='DISPATCHED')::bigint AS "successfulHandoff",
        COUNT(DISTINCT nd."userId") FILTER (WHERE nd."status"='PENDING' AND nd."attemptCount">0)::bigint AS "retryingHandoff",
        COUNT(DISTINCT nd."userId") FILTER (WHERE nd."attemptCount">0)::bigint AS "attemptedRecipients",
        COALESCE(SUM(nd."attemptCount"), 0)::bigint AS "totalAttempts"
      FROM "NoticeRecipient" nr
      LEFT JOIN "NoticeDispatch" nd
        ON nd."societyId"=nr."societyId"
       AND nd."noticeId"=nr."noticeId"
       AND nd."userId"=nr."userId"
      WHERE nr."societyId"=${societyId}::uuid AND nr."noticeId"=${noticeId}::uuid
    `);
    const row = rows[0] ?? {
      totalRecipients: 0n,
      readRecipients: 0n,
      acknowledgedRecipients: 0n,
      pendingHandoff: 0n,
      inFlightHandoff: 0n,
      successfulHandoff: 0n,
      retryingHandoff: 0n,
      attemptedRecipients: 0n,
      totalAttempts: 0n,
    };

    const totalRecipients = Number(row.totalRecipients);
    const readRecipients = Number(row.readRecipients);
    const acknowledgedRecipients = Number(row.acknowledgedRecipients);

    return {
      noticeId,
      noticeStatus: notice.status,
      publishedAt: notice.publishedAt,
      expiresAt: notice.expiresAt,
      requiresAcknowledgement: notice.requiresAcknowledgement,
      recipientSnapshot: {
        total: totalRecipients,
      },
      pushHandoff: {
        pending: Number(row.pendingHandoff),
        inFlight: Number(row.inFlightHandoff),
        successful: Number(row.successfulHandoff),
        retrying: Number(row.retryingHandoff),
        attemptedRecipients: Number(row.attemptedRecipients),
        totalAttempts: Number(row.totalAttempts),
      },
      engagement: {
        read: readRecipients,
        unread: Math.max(0, totalRecipients - readRecipients),
        acknowledged: acknowledgedRecipients,
        pendingAcknowledgement: notice.requiresAcknowledgement
          ? Math.max(0, totalRecipients - acknowledgedRecipients)
          : 0,
      },
      semantics: {
        pushHandoff: 'Successful means handed to the configured push provider pipeline; it is not proof that a device displayed or a person read the notice.',
        read: 'Read is an in-app acknowledgement recorded when the assigned recipient opens the notice.',
        legalService: 'These metrics must not be represented as legally effective service without a separate valid policy or legal basis.',
      },
    };
  }
}
