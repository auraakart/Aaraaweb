import { Prisma } from '@prisma/client';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';

type Candidate = { id: string; societyId: string };
type ExpiredBooking = Candidate & { amenityId: string; startsAt: Date; endsAt: Date };

/** Global discovery is a fixed capability; all operational queries use the selected society. */
export class AmenityDepositExpiryWorker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promote: (tx: Prisma.TransactionClient, booking: ExpiredBooking) => Promise<unknown>,
  ) {}

  run(limit = 50) {
    const batchLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 50;
    // Preserve all-or-nothing batch rollback, row/advisory lock order and promotion.
    return this.prisma.$transaction(async tx => {
      const candidates = await tx.$queryRaw<Candidate[]>(Prisma.sql`
        SELECT "id","societyId" FROM aaraagate_due_amenity_deposits(${batchLimit}::integer)
      `);
      let expired = 0;
      for (const candidate of candidates) {
        await tx.$queryRaw(Prisma.sql`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${candidate.societyId}, true)`);
        const [booking] = await tx.$queryRaw<ExpiredBooking[]>(Prisma.sql`
          SELECT b."id",b."societyId",b."amenityId",b."startsAt",b."endsAt"
          FROM "AmenityBooking" b
          JOIN "Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
          JOIN "Unit" u ON u."id"=b."unitId" AND u."societyId"=b."societyId"
          JOIN "Building" parent ON parent."id"=u."buildingId" AND parent."societyId"=b."societyId"
          WHERE b."id"=${candidate.id}::uuid AND b."societyId"=${candidate.societyId}::uuid
            AND b."status"='CONFIRMED' AND b."depositStatus"='PAYMENT_REQUIRED'
            AND b."depositPaise">0 AND b."depositDueAt"<=CURRENT_TIMESTAMP
          FOR UPDATE OF b SKIP LOCKED
        `);
        if (!booking) continue;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${booking.societyId}:${booking.amenityId}`}))::text`;
        const closed = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE "AmenityBooking"
          SET "status"='CANCELLED',"depositStatus"='VOIDED',"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${booking.id}::uuid AND "societyId"=${booking.societyId}::uuid
            AND "status"='CONFIRMED' AND "depositStatus"='PAYMENT_REQUIRED'
            AND "depositDueAt"<=CURRENT_TIMESTAMP
          RETURNING "id"
        `;
        if (!closed[0]) continue;
        await this.promote(tx, booking);
        expired++;
      }
      return { expired, mutationPerformed: expired > 0, boundary: 'Only unpaid refundable-deposit reservations past their server deadline are released. Captured funds are never auto-refunded or forfeited.' };
    });
  }
}
