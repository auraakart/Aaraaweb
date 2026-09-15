import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';

const OVERDUE_AFTER_HOURS = 24;
const REMINDER_COOLDOWN_HOURS = 6;

@Injectable()
export class ParcelReminderService {
  constructor(private readonly prisma: PrismaService, private readonly realtime?: NotificationRealtimeService) {}

  async remind(societyId: string, actorUserId: string, parcelId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const [parcel] = await tx.$queryRaw<Array<{
        id: string; unitId: string; recipientUserId: string; courierName: string | null; receivedAt: Date; status: string;
      }>>(Prisma.sql`
        SELECT "id","unitId","recipientUserId","courierName","receivedAt","status"
        FROM "Parcel"
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!parcel || parcel.status !== 'RECEIVED') throw new NotFoundException('Uncollected parcel not found');

      const [eligibility] = await tx.$queryRaw<Array<{ overdue: boolean; cooldownActive: boolean }>>(Prisma.sql`
        SELECT
          (${parcel.receivedAt}::timestamptz <= CURRENT_TIMESTAMP - make_interval(hours => ${OVERDUE_AFTER_HOURS})) AS overdue,
          EXISTS (
            SELECT 1 FROM "ParcelEvent" pe
            WHERE pe."societyId"=${societyId}::uuid AND pe."parcelId"=${parcelId}::uuid
              AND pe."action"='REMINDER_SENT'
              AND pe."occurredAt" > CURRENT_TIMESTAMP - make_interval(hours => ${REMINDER_COOLDOWN_HOURS})
          ) AS "cooldownActive"
      `);
      if (!eligibility?.overdue) throw new BadRequestException('Parcel reminder is available only after 24 hours uncollected');
      if (eligibility.cooldownActive) throw new BadRequestException('A parcel reminder was sent recently; try again after the cooldown');

      const [event] = await tx.$queryRaw<Array<{ occurredAt: Date }>>(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,'REMINDER_SENT','Overdue parcel reminder')
        RETURNING "occurredAt"
      `);
      return { parcel, occurredAt: event.occurredAt };
    });

    this.realtime?.publishResident({
      type: 'PARCEL_RECEIVED',
      societyId,
      userId: result.parcel.recipientUserId,
      unitId: result.parcel.unitId,
      parcelId: result.parcel.id,
      title: 'Parcel pickup reminder',
      body: result.parcel.courierName
        ? `Your parcel from ${result.parcel.courierName} is still waiting for collection.`
        : 'Your parcel is still waiting for collection.',
      createdAt: result.occurredAt.toISOString(),
    });

    return { parcelId, remindedAt: result.occurredAt.toISOString(), cooldownHours: REMINDER_COOLDOWN_HOURS };
  }
}
