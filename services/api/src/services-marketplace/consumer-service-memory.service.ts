import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

@Injectable()
export class ConsumerServiceMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  listFavorites(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        f."providerId",
        p."businessName",
        p."description",
        f."updatedAt"
      FROM "ConsumerFavoriteProvider" f
      JOIN "ServiceProvider" p
        ON p."id" = f."providerId"
       AND p."active" = true
       AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      WHERE f."userId" = ${userId}::uuid
        AND f."active" = true
      ORDER BY f."updatedAt" DESC, p."businessName" ASC
    `);
  }

  /**
   * Services 4.4.1 — informational groundwork only, not a rewards program.
   * Bookings are scoped to the authenticated consumer; no payment or
   * entitlement ledger is read or changed. Historical activity never
   * grants loyalty points, coverage, discounts or membership eligibility.
   */
  async getMyBenefitsReadiness(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      completedBookings: number;
      completedProviders: number;
    }>>(Prisma.sql`
      SELECT COUNT(*) FILTER (
        WHERE b."status" = 'COMPLETED'::"ServiceBookingStatus"
      )::int AS "completedBookings",
      COUNT(DISTINCT b."providerId") FILTER (
        WHERE b."status" = 'COMPLETED'::"ServiceBookingStatus"
      )::int AS "completedProviders"
      FROM "ConsumerServiceBooking" b
      WHERE b."userId" = ${userId}::uuid
    `);
    // The aggregate is historical activity, not a benefit eligibility rule.
    const completedBookings = Number(rows[0]?.completedBookings ?? 0);
    const completedProviders = Number(rows[0]?.completedProviders ?? 0);
    if (!Number.isSafeInteger(completedBookings) || completedBookings < 0 ||
        !Number.isSafeInteger(completedProviders) || completedProviders < 0) {
      throw new BadRequestException('Invalid service activity summary');
    }
    return {
      readOnly: true,
      activitySource: 'AUTHENTICATED_COMPLETED_BOOKINGS' as const,
      historicalActivityOnly: true,
      completedBookings,
      completedProviders,
      eligibilityDetermined: false,
      membership: {
        status: 'NOT_LAUNCHED' as const,
        enrollmentAvailable: false,
        activeEntitlement: null,
        pricePaise: null,
      },
      loyalty: {
        status: 'NOT_LAUNCHED' as const,
        pointsBalance: null,
        redeemableAmountPaise: null,
        earnRate: null,
        redemptionEnabled: false,
      },
      optionalProtection: {
        status: 'NOT_OFFERED' as const,
        coverageConfirmed: false,
        claimAvailable: false,
        terms: null,
      },
      bookingCreated: false,
      chargeAuthorized: false,
    };
  }

  listRecentProviders(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        b."providerId",
        p."businessName",
        p."description",
        MAX(COALESCE(completed_event."completedAt", b."updatedAt")) AS "lastCompletedAt",
        COUNT(*)::int AS "completedBookings"
      FROM "ConsumerServiceBooking" b
      JOIN "ServiceProvider" p
        ON p."id" = b."providerId"
       AND p."active" = true
       AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      LEFT JOIN LATERAL (
        SELECT e."occurredAt" AS "completedAt"
        FROM "ConsumerServiceBookingEvent" e
        WHERE e."bookingId" = b."id"
          AND e."toStatus" = 'COMPLETED'::"ServiceBookingStatus"
        ORDER BY e."occurredAt" DESC
        LIMIT 1
      ) completed_event ON true
      WHERE b."userId" = ${userId}::uuid
        AND b."status" = 'COMPLETED'::"ServiceBookingStatus"
      GROUP BY b."providerId", p."businessName", p."description"
      ORDER BY "lastCompletedAt" DESC, p."businessName" ASC
      LIMIT 8
    `);
  }

  async setFavorite(userId: string, providerId: string, active: boolean) {
    const providers = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ServiceProvider"
      WHERE "id" = ${providerId}::uuid
        AND "active" = true
        AND "verification" = 'VERIFIED'::"ProviderVerificationStatus"
      LIMIT 1
    `);
    if (!providers[0]) throw new NotFoundException('Verified provider not found');

    const rows = await this.prisma.$queryRaw<Array<{ providerId: string; active: boolean }>>(Prisma.sql`
      INSERT INTO "ConsumerFavoriteProvider" (
        "userId", "providerId", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${userId}::uuid, ${providerId}::uuid, ${active}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "providerId") DO UPDATE SET
        "active" = EXCLUDED."active",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "providerId", "active"
    `);
    return rows[0];
  }

  /**
   * Services 4.2.5: read-only, owner-scoped technician continuity evidence.
   * Only the plan owner's COMPLETED visits with a recorded arrival count.
   * Active/verified listing is not skill, schedule or dispatch availability.
   */
  async getRecurringTechnicianContinuity(userId: string, planId: string) {
    const plans = await this.prisma.$queryRaw<Array<{
      id: string; offeringId: string; locationType: ConsumerServiceLocationType;
      locationId: string; status: string;
    }>>(Prisma.sql`
      SELECT "id", "offeringId", "locationType", "locationId", "status"
      FROM "ConsumerServiceRecurringPlan"
      WHERE "id" = ${planId}::uuid AND "userId" = ${userId}::uuid
      LIMIT 1
    `);
    const plan = plans[0];
    if (!plan) throw new NotFoundException('Recurring service plan not found');
    if (plan.locationType !== 'HOME' && plan.locationType !== 'SOCIETY_UNIT') {
      throw new BadRequestException('Unsupported recurring service location');
    }

    // Revalidate CURRENT home ownership or society occupancy/verified ownership.
    // A historical plan does not grant indefinite society-unit visibility.
    const location = await this.locations.resolveLocation(userId, plan.locationType, plan.locationId);
    const matchesCurrentLocation = plan.locationType === 'HOME'
      ? location.homeId === plan.locationId
      : location.societyUnitId === plan.locationId;
    if (!matchesCurrentLocation) throw new NotFoundException('Recurring service location not available');

    const technicians = await this.prisma.$queryRaw<Array<{
      agentId: string; displayName: string; lastArrivedAt: Date; completedVisits: number;
    }>>(Prisma.sql`
      SELECT ag."id" AS "agentId", ag."displayName",
             MAX(a."arrivedAt") AS "lastArrivedAt",
             COUNT(DISTINCT b."id")::int AS "completedVisits"
      FROM "ConsumerServiceBooking" b
      JOIN "ServiceOffering" o
        ON o."id" = b."offeringId" AND o."active" = true
      JOIN "ServiceProvider" p
        ON p."id" = o."providerId" AND p."active" = true
        AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      JOIN "ConsumerServiceAssignment" a
        ON a."bookingId" = b."id"
        AND a."providerId" = b."providerId"
        AND a."arrivedAt" IS NOT NULL
      JOIN "ConsumerProviderAgent" ag
        ON ag."id" = a."agentId"
        AND ag."providerId" = a."providerId"
        AND ag."active" = true
      WHERE b."userId" = ${userId}::uuid
        AND b."offeringId" = ${plan.offeringId}::uuid
        AND b."providerId" = p."id"
        AND b."status" = 'COMPLETED'::"ServiceBookingStatus"
        AND (
          (${plan.locationType} = 'HOME' AND b."homeId" = ${plan.locationId}::uuid)
          OR (${plan.locationType} = 'SOCIETY_UNIT' AND b."societyUnitId" = ${plan.locationId}::uuid)
        )
      GROUP BY ag."id", ag."displayName"
      ORDER BY "lastArrivedAt" DESC, "agentId" ASC
      LIMIT 3
    `);
    return {
      planId: plan.id,
      planStatus: plan.status,
      evidenceBasis: 'OWNER_COMPLETED_VISITS_WITH_RECORDED_AGENT_ARRIVAL' as const,
      historicalEvidenceOnly: true,
      activeAgentRecordOnly: true,
      technicianAvailabilityConfirmed: false,
      technicianAssignmentGuaranteed: false,
      bookingCreated: false,
      automaticDispatch: false,
      candidates: technicians,
    };
  }


  /** Services 4.2.6: an explicit, optional request, never a reservation. */
  private async assertCurrentBookingLocation(userId: string, booking: {
    homeId: string | null; societyUnitId: string | null;
  }) {
    const locationType: ConsumerServiceLocationType | null = booking.homeId
      ? 'HOME' : booking.societyUnitId ? 'SOCIETY_UNIT' : null;
    const locationId = booking.homeId ?? booking.societyUnitId;
    if (!locationType || !locationId) throw new NotFoundException('Service booking location unavailable');
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    if (locationType === 'HOME' ? location.homeId !== locationId : location.societyUnitId !== locationId) {
      throw new NotFoundException('Service booking location unavailable');
    }
  }

  /** Services 4.2.7: historical eligible agents for an owned booking, not availability. */
  async getBookingTechnicianCandidates(userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; homeId: string | null; societyUnitId: string | null;
      offeringId: string; providerId: string; status: string; hasActiveAssignment: boolean;
    }>>(Prisma.sql`
      SELECT b."id", b."homeId", b."societyUnitId", b."offeringId", b."providerId", b."status",
        EXISTS (
          SELECT 1 FROM "ConsumerServiceAssignment" active
          WHERE active."bookingId" = b."id"
            AND active."status" IN ('ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED')
        ) AS "hasActiveAssignment"
      FROM "ConsumerServiceBooking" b
      WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
      LIMIT 1
    `);
    const booking = rows[0];
    if (!booking) throw new NotFoundException('Service booking not found');
    await this.assertCurrentBookingLocation(userId, booking);
    if (!['REQUESTED', 'CONFIRMED'].includes(booking.status) || booking.hasActiveAssignment) {
      throw new BadRequestException('Technician preference is closed for this booking');
    }
    const candidates = await this.prisma.$queryRaw<Array<{
      agentId: string; displayName: string; completedVisits: number; lastArrivedAt: Date;
    }>>(Prisma.sql`
      SELECT ag."id" AS "agentId", ag."displayName",
        COUNT(DISTINCT historical."id")::int AS "completedVisits",
        MAX(a."arrivedAt") AS "lastArrivedAt"
      FROM "ConsumerServiceBooking" historical
      JOIN "ConsumerServiceAssignment" a
        ON a."bookingId" = historical."id"
        AND a."providerId" = historical."providerId"
        AND a."arrivedAt" IS NOT NULL
      JOIN "ConsumerProviderAgent" ag
        ON ag."id" = a."agentId" AND ag."providerId" = a."providerId"
        AND ag."active" = true
      JOIN "ServiceProvider" p
        ON p."id" = ag."providerId" AND p."active" = true
        AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      WHERE historical."userId" = ${userId}::uuid
        AND historical."offeringId" = ${booking.offeringId}::uuid
        AND historical."providerId" = ${booking.providerId}::uuid
        AND historical."status" = 'COMPLETED'::"ServiceBookingStatus"
        AND (
          (${booking.homeId}::uuid IS NOT NULL AND historical."homeId" = ${booking.homeId}::uuid)
          OR (${booking.societyUnitId}::uuid IS NOT NULL AND historical."societyUnitId" = ${booking.societyUnitId}::uuid)
        )
      GROUP BY ag."id", ag."displayName"
      ORDER BY "lastArrivedAt" DESC, "agentId" ASC
      LIMIT 20
    `);
    return {
      bookingId: booking.id, candidates,
      evidenceBasis: 'OWNER_COMPLETED_VISIT_SAME_OFFERING_AND_LOCATION',
      historicalEvidenceOnly: true,
      availabilityConfirmed: false, technicianAssignmentGuaranteed: false, requestOnly: true,
    };
  }

  /**
   * Services 4.2.8: a single owner-scoped snapshot of an explicit technician
   * request and an ACTIVE dispatch assignment. Assignment is never inferred
   * from the request or from historical/released dispatch records.
   */
  async getBookingTechnicianRequestStatus(userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; homeId: string | null; societyUnitId: string | null;
      bookingStatus: string; requestedAgentId: string | null;
      requestedTechnicianName: string | null;
      assignedAgentId: string | null; assignedTechnicianName: string | null;
      dispatchStatus: string | null;
    }>>(Prisma.sql`
      SELECT b."id", b."homeId", b."societyUnitId",
             b."status" AS "bookingStatus",
             pref."agentId" AS "requestedAgentId",
             requested."displayName" AS "requestedTechnicianName",
             assigned."agentId" AS "assignedAgentId",
             active_agent."displayName" AS "assignedTechnicianName",
             assigned."status" AS "dispatchStatus"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ConsumerServiceTechnicianPreference" pref
        ON pref."bookingId" = b."id"
        AND pref."userId" = b."userId"
        AND pref."providerId" = b."providerId"
      LEFT JOIN "ConsumerProviderAgent" requested
        ON requested."id" = pref."agentId"
        AND requested."providerId" = b."providerId"
      LEFT JOIN LATERAL (
        SELECT a."agentId", a."providerId", a."status"
        FROM "ConsumerServiceAssignment" a
        WHERE a."bookingId" = b."id"
          AND a."providerId" = b."providerId"
          AND a."status" IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED')
        ORDER BY a."assignedAt" DESC, a."id" DESC LIMIT 1
      ) assigned ON true
      LEFT JOIN "ConsumerProviderAgent" active_agent
        ON active_agent."id" = assigned."agentId"
        AND active_agent."providerId" = assigned."providerId"
      WHERE b."id" = ${bookingId}::uuid
        AND b."userId" = ${userId}::uuid
      LIMIT 1
    `);
    const booking = rows[0];
    if (!booking) throw new NotFoundException('Service booking not found');
    await this.assertCurrentBookingLocation(userId, booking);
    const hasRequest = booking.requestedAgentId != null;
    const hasAssignment = booking.assignedAgentId != null;
    const canChangeRequest = ['REQUESTED', 'CONFIRMED'].includes(booking.bookingStatus) && !hasAssignment;
    const cancelled = ['CANCELLED', 'REFUNDED'].includes(booking.bookingStatus);
    const requestStatus = !hasRequest ? 'NO_REQUEST'
      : cancelled ? 'REQUEST_CLOSED'
      : hasAssignment ? (
        booking.requestedAgentId === booking.assignedAgentId
          ? 'REQUESTED_TECHNICIAN_ASSIGNED' : 'OTHER_TECHNICIAN_ASSIGNED'
      ) : canChangeRequest ? 'AWAITING_ASSIGNMENT' : 'REQUEST_CLOSED';

    return {
      bookingId: booking.id,
      bookingStatus: booking.bookingStatus,
      requestStatus,
      requestedTechnicianName: hasRequest ? booking.requestedTechnicianName : null,
      assignedTechnicianName: hasAssignment ? booking.assignedTechnicianName : null,
      dispatchStatus: hasAssignment ? booking.dispatchStatus : null,
      preferenceRecorded: hasRequest,
      canChangeRequest,
      statusSnapshotOnly: true,
      availabilityGuaranteed: false,
      assignmentByRequestProven: false,
    };
  }

  async getBookingTechnicianPreference(userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; homeId: string | null; societyUnitId: string | null;
      agentId: string | null; displayName: string | null; technicianRecordActive: boolean;
    }>>(Prisma.sql`
      SELECT b."id", b."homeId", b."societyUnitId",
             pref."agentId", ag."displayName",
             COALESCE(
               ag."active" AND p."active" AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus",
               false
             ) AS "technicianRecordActive"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ConsumerServiceTechnicianPreference" pref
        ON pref."bookingId" = b."id"
        AND pref."userId" = b."userId"
        AND pref."providerId" = b."providerId"
      LEFT JOIN "ConsumerProviderAgent" ag
        ON ag."id" = pref."agentId" AND ag."providerId" = b."providerId"
      LEFT JOIN "ServiceProvider" p ON p."id" = b."providerId"
      WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
      LIMIT 1
    `);
    const booking = rows[0];
    if (!booking) throw new NotFoundException('Service booking not found');
    await this.assertCurrentBookingLocation(userId, booking);
    return {
      bookingId: booking.id,
      agentId: booking.agentId ?? null,
      displayName: booking.displayName ?? null,
      technicianRecordActive: booking.technicianRecordActive ?? false,
      requestOnly: true, availabilityConfirmed: false, assignmentGuaranteed: false,
    };
  }

  async setBookingTechnicianPreference(userId: string, bookingId: string, agentId: string | null) {
    if (agentId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agentId)) {
      throw new BadRequestException('Valid technician ID or null is required');
    }
    return this.prisma.$transaction(async (tx) => {
      // Dispatch assign() locks the same booking first. Reject any
      // modification after assignment, including while a dispatch races us.
      const rows = await tx.$queryRaw<Array<{
        id: string; homeId: string | null; societyUnitId: string | null;
        providerId: string; offeringId: string; status: string; hasActiveAssignment: boolean;
      }>>(Prisma.sql`
        SELECT b."id", b."homeId", b."societyUnitId",
               b."providerId", b."offeringId", b."status",
               EXISTS (
                 SELECT 1 FROM "ConsumerServiceAssignment" a
                 WHERE a."bookingId" = b."id"
                   AND a."status" IN ('ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED')
               ) AS "hasActiveAssignment"
        FROM "ConsumerServiceBooking" b
        WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
        FOR UPDATE OF b
      `);
      const booking = rows[0];
      if (!booking) throw new NotFoundException('Service booking not found');
      if (!['REQUESTED', 'CONFIRMED'].includes(booking.status) || booking.hasActiveAssignment) {
        throw new BadRequestException('Technician request is closed for this booking');
      }
      await this.assertCurrentBookingLocation(userId, booking);
      if (agentId === null) {
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "ConsumerServiceTechnicianPreference"
          WHERE "bookingId" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
        `);
        return { bookingId, agentId: null, displayName: null, requestOnly: true, assignmentGuaranteed: false };
      }

      const previous = await tx.$queryRaw<Array<{ agentId: string; displayName: string }>>(Prisma.sql`
        SELECT ag."id" AS "agentId", ag."displayName"
        FROM "ConsumerProviderAgent" ag
        JOIN "ServiceProvider" p
          ON p."id" = ag."providerId"
          AND p."active" = true
          AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
        WHERE ag."id" = ${agentId}::uuid
          AND ag."providerId" = ${booking.providerId}::uuid
          AND ag."active" = true
          AND EXISTS (
            SELECT 1 FROM "ConsumerServiceBooking" historical
            JOIN "ConsumerServiceAssignment" a
              ON a."bookingId" = historical."id"
              AND a."providerId" = historical."providerId"
              AND a."agentId" = ag."id"
              AND a."arrivedAt" IS NOT NULL
            WHERE historical."userId" = ${userId}::uuid
              AND historical."offeringId" = ${booking.offeringId}::uuid
              AND historical."providerId" = ${booking.providerId}::uuid
              AND historical."status" = 'COMPLETED'::"ServiceBookingStatus"
              AND (
                (${booking.homeId}::uuid IS NOT NULL
                 AND historical."homeId" = ${booking.homeId}::uuid)
                OR (${booking.societyUnitId}::uuid IS NOT NULL
                    AND historical."societyUnitId" = ${booking.societyUnitId}::uuid)
              )
          )
        LIMIT 1
      `);
      if (!previous[0]) {
        throw new BadRequestException('Technician must have attended your completed visit for this service and location');
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceTechnicianPreference"
          ("bookingId", "userId", "providerId", "agentId", "createdAt", "updatedAt")
        VALUES (
          ${bookingId}::uuid, ${userId}::uuid, ${booking.providerId}::uuid,
          ${agentId}::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("bookingId") DO UPDATE SET
          "agentId" = EXCLUDED."agentId", "updatedAt" = CURRENT_TIMESTAMP
      `);
      return {
        bookingId, agentId: previous[0].agentId, displayName: previous[0].displayName,
        requestOnly: true, availabilityConfirmed: false, assignmentGuaranteed: false,
      };
    });
  }

  async listHistory(
    userId: string,
    locationType: ConsumerServiceLocationType,
    locationId: string,
  ) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    const homeId = location.homeId;
    const societyUnitId = location.societyUnitId;

    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        b."id",
        b."providerId",
        b."offeringId",
        b."offeringName",
        b."providerName",
        b."scheduledFrom",
        b."scheduledUntil",
        b."servicePricePaise",
        COALESCE(completed_event."completedAt", b."updatedAt") AS "completedAt",
        r."stars" AS "ratingStars",
        r."comment" AS "ratingComment",
        ws."warrantyDays",
        ws."revisitPolicy",
        ws."warrantyStartedAt",
        ws."warrantyUntil",
        CASE
          WHEN ws."warrantyUntil" IS NULL THEN false
          ELSE ws."warrantyUntil" >= CURRENT_TIMESTAMP
        END AS "warrantyActive",
        current_o."currentOffering",
        (current_o."currentOffering" IS NOT NULL) AS "canRebook"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ConsumerServiceRating" r
        ON r."bookingId" = b."id" AND r."userId" = ${userId}::uuid
      LEFT JOIN "ConsumerServiceWarrantySnapshot" ws
        ON ws."bookingId" = b."id"
      LEFT JOIN LATERAL (
        SELECT e."occurredAt" AS "completedAt"
        FROM "ConsumerServiceBookingEvent" e
        WHERE e."bookingId" = b."id"
          AND e."toStatus" = 'COMPLETED'::"ServiceBookingStatus"
        ORDER BY e."occurredAt" DESC
        LIMIT 1
      ) completed_event ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', o."id",
          'providerId', o."providerId",
          'name', o."name",
          'description', o."description",
          'pricePaise', o."pricePaise",
          'durationMinutes', o."durationMinutes",
          'providerName', p."businessName",
          'provider', jsonb_build_object(
            'id', p."id",
            'businessName', p."businessName",
            'description', p."description"
          )
        ) AS "currentOffering"
        FROM "ServiceOffering" o
        JOIN "ServiceProvider" p
          ON p."id" = o."providerId"
         AND p."active" = true
         AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
        JOIN "ConsumerProviderServiceArea" pa
          ON pa."providerId" = p."id"
         AND pa."postalCode" = ${location.postalCode}
         AND pa."active" = true
        WHERE o."id" = b."offeringId"
          AND o."providerId" = b."providerId"
          AND o."active" = true
          AND (
            NOT EXISTS (
              SELECT 1 FROM "ConsumerOfferingServiceArea" osa
              WHERE osa."offeringId" = o."id"
            )
            OR EXISTS (
              SELECT 1 FROM "ConsumerOfferingServiceArea" osa
              WHERE osa."offeringId" = o."id"
                AND osa."postalCode" = ${location.postalCode}
                AND osa."active" = true
            )
          )
        LIMIT 1
      ) current_o ON true
      WHERE b."status" = 'COMPLETED'::"ServiceBookingStatus"
        AND (
          (${homeId}::uuid IS NOT NULL AND b."homeId" = ${homeId}::uuid AND b."userId" = ${userId}::uuid)
          OR (${societyUnitId}::uuid IS NOT NULL AND b."societyUnitId" = ${societyUnitId}::uuid)
        )
      ORDER BY COALESCE(completed_event."completedAt", b."updatedAt") DESC
      LIMIT 100
    `);
  }
}
