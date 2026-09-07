import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type ConsumerServiceLocationType = 'HOME' | 'SOCIETY_UNIT';

export type SocietyServiceAddressInput = {
  addressLine1: string;
  addressLine2?: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
};

type ResolvedLocation = {
  type: ConsumerServiceLocationType;
  id: string;
  homeId: string | null;
  societyUnitId: string | null;
  societyId: string | null;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string | null;
  longitude: string | null;
};

type SocietyServiceAddressRow = {
  id: string;
  societyId: string;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OfferingServiceAreaRow = {
  id: string;
  offeringId: string;
  postalCode: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ConsumerServiceLocationService {
  constructor(private readonly prisma: PrismaService) {}

  listLocations(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        'HOME'::text AS "type",
        h."id",
        h."label",
        h."addressLine1",
        h."addressLine2",
        h."locality",
        h."city",
        h."state",
        h."postalCode",
        h."latitude",
        h."longitude",
        NULL::uuid AS "societyId",
        NULL::uuid AS "unitId",
        true AS "serviceAddressConfigured"
      FROM "ConsumerHome" h
      WHERE h."userId" = ${userId}::uuid AND h."active" = true

      UNION ALL

      SELECT DISTINCT ON (u."id")
        'SOCIETY_UNIT'::text AS "type",
        u."id",
        CONCAT(s."name", ' · ', b."name", ' ', u."number") AS "label",
        CASE WHEN a."id" IS NULL THEN NULL ELSE CONCAT(b."name", ' ', u."number", ', ', a."addressLine1") END AS "addressLine1",
        a."addressLine2",
        a."locality",
        a."city",
        a."state",
        a."postalCode",
        a."latitude",
        a."longitude",
        s."id" AS "societyId",
        u."id" AS "unitId",
        (a."id" IS NOT NULL AND a."active" = true) AS "serviceAddressConfigured"
      FROM "Unit" u
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "Society" s ON s."id" = u."societyId" AND s."status" = 'ACTIVE'::"SocietyStatus"
      LEFT JOIN "SocietyServiceAddress" a ON a."societyId" = s."id"
      WHERE EXISTS (
        SELECT 1 FROM "UnitOccupancy" o
        WHERE o."unitId" = u."id" AND o."userId" = ${userId}::uuid AND o."active" = true
          AND o."effectiveFrom" <= CURRENT_TIMESTAMP
          AND (o."effectiveTo" IS NULL OR o."effectiveTo" > CURRENT_TIMESTAMP)
      ) OR EXISTS (
        SELECT 1 FROM "UnitOwnership" ow
        WHERE ow."unitId" = u."id" AND ow."userId" = ${userId}::uuid AND ow."active" = true
          AND ow."effectiveFrom" <= CURRENT_TIMESTAMP
          AND (ow."effectiveTo" IS NULL OR ow."effectiveTo" > CURRENT_TIMESTAMP)
      )
      ORDER BY "type", "label"
    `);
  }

  async resolveLocation(userId: string, type: ConsumerServiceLocationType, id: string): Promise<ResolvedLocation> {
    if (type === 'HOME') {
      const rows = await this.prisma.$queryRaw<Array<ResolvedLocation>>(Prisma.sql`
        SELECT
          'HOME'::text AS "type",
          h."id",
          h."id" AS "homeId",
          NULL::uuid AS "societyUnitId",
          NULL::uuid AS "societyId",
          h."label",
          h."addressLine1",
          h."addressLine2",
          h."locality",
          h."city",
          h."state",
          h."postalCode",
          h."latitude"::text AS "latitude",
          h."longitude"::text AS "longitude"
        FROM "ConsumerHome" h
        WHERE h."id" = ${id}::uuid AND h."userId" = ${userId}::uuid AND h."active" = true
        LIMIT 1
      `);
      if (!rows[0]) throw new NotFoundException('Active home not found');
      return rows[0];
    }

    if (type !== 'SOCIETY_UNIT') throw new BadRequestException('Unsupported service delivery location type');

    const rows = await this.prisma.$queryRaw<Array<ResolvedLocation>>(Prisma.sql`
      SELECT
        'SOCIETY_UNIT'::text AS "type",
        u."id",
        NULL::uuid AS "homeId",
        u."id" AS "societyUnitId",
        s."id" AS "societyId",
        CONCAT(s."name", ' · ', b."name", ' ', u."number") AS "label",
        CONCAT(b."name", ' ', u."number", ', ', a."addressLine1") AS "addressLine1",
        a."addressLine2",
        a."locality",
        a."city",
        a."state",
        a."postalCode",
        a."latitude"::text AS "latitude",
        a."longitude"::text AS "longitude"
      FROM "Unit" u
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "Society" s ON s."id" = u."societyId" AND s."status" = 'ACTIVE'::"SocietyStatus"
      JOIN "SocietyServiceAddress" a ON a."societyId" = s."id" AND a."active" = true
      WHERE u."id" = ${id}::uuid
        AND (
          EXISTS (
            SELECT 1 FROM "UnitOccupancy" o
            WHERE o."unitId" = u."id" AND o."userId" = ${userId}::uuid AND o."active" = true
              AND o."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (o."effectiveTo" IS NULL OR o."effectiveTo" > CURRENT_TIMESTAMP)
          ) OR EXISTS (
            SELECT 1 FROM "UnitOwnership" ow
            WHERE ow."unitId" = u."id" AND ow."userId" = ${userId}::uuid AND ow."active" = true
              AND ow."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (ow."effectiveTo" IS NULL OR ow."effectiveTo" > CURRENT_TIMESTAMP)
          )
        )
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Service-ready society unit not found');
    return rows[0];
  }

  async listServiceableOfferings(userId: string, type: ConsumerServiceLocationType, id: string, categoryId?: string) {
    const location = await this.resolveLocation(userId, type, id);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        o."id",
        o."name",
        o."pricePaise",
        o."durationMinutes",
        c."id" AS "categoryId",
        c."name" AS "categoryName",
        jsonb_build_object('id', c."id", 'name', c."name") AS "category",
        p."id" AS "providerId",
        p."businessName" AS "providerName",
        p."description" AS "providerDescription",
        jsonb_build_object(
          'id', p."id",
          'businessName', p."businessName",
          'description', p."description"
        ) AS "provider"
      FROM "ServiceOffering" o
      JOIN "ServiceCategory" c ON c."id" = o."categoryId" AND c."active" = true
      JOIN "ServiceProvider" p
        ON p."id" = o."providerId" AND p."active" = true
       AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      JOIN "ConsumerProviderServiceArea" pa
        ON pa."providerId" = p."id" AND pa."postalCode" = ${location.postalCode} AND pa."active" = true
      WHERE o."active" = true
        AND (${categoryId ?? null}::uuid IS NULL OR o."categoryId" = ${categoryId ?? null}::uuid)
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
      ORDER BY c."sortOrder" ASC, o."name" ASC, p."businessName" ASC
    `);
  }

  async upsertSocietyServiceAddress(societyId: string, input: SocietyServiceAddressInput) {
    const postalCode = this.normalizePostalCode(input.postalCode);
    const society = await this.prisma.society.findUnique({ where: { id: societyId }, select: { id: true } });
    if (!society) throw new NotFoundException('Society not found');
    const rows = await this.prisma.$queryRaw<SocietyServiceAddressRow[]>(Prisma.sql`
      INSERT INTO "SocietyServiceAddress" (
        "id", "societyId", "addressLine1", "addressLine2", "locality", "city", "state", "postalCode",
        "latitude", "longitude", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid, ${societyId}::uuid, ${input.addressLine1.trim()}, ${input.addressLine2?.trim() || null},
        ${input.locality.trim()}, ${input.city.trim()}, ${input.state.trim()}, ${postalCode},
        ${input.latitude ?? null}, ${input.longitude ?? null}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("societyId") DO UPDATE SET
        "addressLine1" = EXCLUDED."addressLine1",
        "addressLine2" = EXCLUDED."addressLine2",
        "locality" = EXCLUDED."locality",
        "city" = EXCLUDED."city",
        "state" = EXCLUDED."state",
        "postalCode" = EXCLUDED."postalCode",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "active" = true,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  listOfferingServiceAreas(offeringId: string) {
    return this.prisma.$queryRaw<OfferingServiceAreaRow[]>(Prisma.sql`
      SELECT * FROM "ConsumerOfferingServiceArea"
      WHERE "offeringId" = ${offeringId}::uuid
      ORDER BY "postalCode" ASC
    `);
  }

  async addOfferingServiceArea(offeringId: string, postalCode: string) {
    const normalized = this.normalizePostalCode(postalCode);
    const offering = await this.prisma.serviceOffering.findUnique({ where: { id: offeringId }, select: { id: true } });
    if (!offering) throw new NotFoundException('Service offering not found');
    const rows = await this.prisma.$queryRaw<OfferingServiceAreaRow[]>(Prisma.sql`
      INSERT INTO "ConsumerOfferingServiceArea" ("id", "offeringId", "postalCode", "active", "createdAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${offeringId}::uuid, ${normalized}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("offeringId", "postalCode")
      DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  async setOfferingServiceAreaActive(offeringId: string, areaId: string, active: boolean) {
    const rows = await this.prisma.$queryRaw<OfferingServiceAreaRow[]>(Prisma.sql`
      UPDATE "ConsumerOfferingServiceArea"
      SET "active" = ${active}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${areaId}::uuid AND "offeringId" = ${offeringId}::uuid
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Offering service area not found');
    return rows[0];
  }

  private normalizePostalCode(postalCode: string) {
    const normalized = postalCode.replace(/\s+/g, '');
    if (!/^[1-9][0-9]{5}$/.test(normalized)) throw new BadRequestException('Invalid Indian postal code');
    return normalized;
  }
}
