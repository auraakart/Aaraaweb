import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SocietyServiceBookingEventRow = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  accessRequestId: string | null;
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

export type SocietyServiceWarrantyRow = {
  warrantyDays: number | null;
  revisitPolicy: string | null;
  warrantyStartedAt: Date | null;
  warrantyUntil: Date | null;
  capturedAt: Date;
  warrantyActive: boolean;
};

@Injectable()
export class ServiceBookingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async timeline(societyId: string, residentUserId: string, bookingId: string) {
    const booking = await this.prisma.serviceBooking.findFirst({
      where: { id: bookingId, societyId, residentUserId },
      select: {
        id: true,
        status: true,
        scheduledFrom: true,
        scheduledUntil: true,
        servicePricePaise: true,
        provider: { select: { id: true, businessName: true } },
        offering: { select: { id: true, name: true } },
        accessRequest: {
          select: {
            id: true,
            status: true,
            validFrom: true,
            validUntil: true,
            enteredAt: true,
            exitedAt: true,
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Service booking not found');

    const [events, warranties] = await Promise.all([
      this.prisma.$queryRaw<SocietyServiceBookingEventRow[]>(Prisma.sql`
        SELECT
          "id", "action", "fromStatus", "toStatus", "accessRequestId", "actorUserId", "metadata", "occurredAt"
        FROM "SocietyServiceBookingEvent"
        WHERE "societyId" = ${societyId}::uuid
          AND "bookingId" = ${bookingId}::uuid
        ORDER BY "occurredAt" ASC, "id" ASC
      `),
      this.prisma.$queryRaw<SocietyServiceWarrantyRow[]>(Prisma.sql`
        SELECT
          "warrantyDays",
          "revisitPolicy",
          "warrantyStartedAt",
          "warrantyUntil",
          "capturedAt",
          CASE
            WHEN "warrantyUntil" IS NULL THEN false
            ELSE "warrantyUntil" >= CURRENT_TIMESTAMP
          END AS "warrantyActive"
        FROM "SocietyServiceWarrantySnapshot"
        WHERE "bookingId" = ${bookingId}::uuid
        LIMIT 1
      `),
    ]);

    return { booking, events, warranty: warranties[0] ?? null };
  }
}
