import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ConsentRow = {
  id: string;
  societyId: string;
  subjectUserId: string;
  dataCategoryCode: string | null;
  purpose: string;
  status: 'GRANTED' | 'WITHDRAWN';
  minorAtRecord: boolean;
  representativeUserId: string | null;
  relationshipReference: string | null;
  evidenceReference: string | null;
  grantedAt: Date;
  withdrawnAt: Date | null;
  createdByUserId: string;
};

@Injectable()
export class PrivacyConsentService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.$queryRaw<Array<ConsentRow & { subjectName: string; representativeName: string | null }>>(Prisma.sql`
      SELECT c.*, subject."name" AS "subjectName", representative."name" AS "representativeName"
      FROM "PrivacyConsentRecord" c
      JOIN "User" subject ON subject."id" = c."subjectUserId"
      LEFT JOIN "User" representative ON representative."id" = c."representativeUserId"
      WHERE c."societyId" = ${societyId}::uuid
      ORDER BY c."createdAt" DESC
      LIMIT 250
    `);
  }

  async record(
    societyId: string,
    actorUserId: string,
    input: {
      subjectUserId: string;
      dataCategoryCode?: string;
      purpose: string;
      minorAtRecord: boolean;
      representativeUserId?: string;
      relationshipReference?: string;
      evidenceReference?: string;
      grantedAt: string;
    },
  ) {
    await this.assertSocietyRelationship(societyId, input.subjectUserId, 'Consent subject');
    const purpose = input.purpose.trim();
    if (!purpose) throw new BadRequestException('Consent purpose is required');
    const grantedAt = new Date(input.grantedAt);
    if (Number.isNaN(grantedAt.getTime())) throw new BadRequestException('Consent grantedAt is invalid');

    const dataCategoryCode = input.dataCategoryCode?.trim() || null;
    if (dataCategoryCode) await this.assertActiveDataCategory(societyId, dataCategoryCode);

    const relationshipReference = input.relationshipReference?.trim() || null;
    const evidenceReference = input.evidenceReference?.trim() || null;
    const representativeUserId = input.representativeUserId || null;
    if (input.minorAtRecord) {
      if (!representativeUserId || !relationshipReference) {
        throw new BadRequestException('Minor-data consent requires representative and relationship evidence');
      }
      if (representativeUserId === input.subjectUserId) {
        throw new BadRequestException('Minor-data representative must be different from the subject');
      }
      await this.assertSocietyRelationship(societyId, representativeUserId, 'Consent representative');
    } else if (representativeUserId) {
      await this.assertSocietyRelationship(societyId, representativeUserId, 'Consent representative');
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ConsentRow[]>(Prisma.sql`
        INSERT INTO "PrivacyConsentRecord" (
          "societyId", "subjectUserId", "dataCategoryCode", "purpose", "minorAtRecord",
          "representativeUserId", "relationshipReference", "evidenceReference", "grantedAt", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid, ${input.subjectUserId}::uuid, ${dataCategoryCode}, ${purpose}, ${input.minorAtRecord},
          ${representativeUserId}::uuid, ${relationshipReference}, ${evidenceReference}, ${grantedAt}, ${actorUserId}::uuid
        ) RETURNING *
      `);
      const consent = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyConsentEvent" ("societyId", "consentId", "actorUserId", "eventType", "summary", "metadataJson")
        VALUES (
          ${societyId}::uuid, ${consent.id}::uuid, ${actorUserId}::uuid,
          'CONSENT_RECORDED', 'Consent record created for an explicitly consent-based workflow',
          ${JSON.stringify({ dataCategoryCode, minorAtRecord: input.minorAtRecord, representativeUserId })}::jsonb
        )
      `);
      return consent;
    });
  }

  async withdraw(societyId: string, actorUserId: string, consentId: string, note?: string) {
    const current = await this.find(societyId, consentId);
    if (!current) throw new NotFoundException('Privacy consent record not found');
    if (current.status === 'WITHDRAWN') return current;
    const cleanNote = note?.trim() || 'Consent withdrawn';

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ConsentRow[]>(Prisma.sql`
        UPDATE "PrivacyConsentRecord"
        SET "status" = 'WITHDRAWN', "withdrawnAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${consentId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = 'GRANTED'
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy consent record changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyConsentEvent" ("societyId", "consentId", "actorUserId", "eventType", "summary", "metadataJson")
        VALUES (${societyId}::uuid, ${consentId}::uuid, ${actorUserId}::uuid, 'CONSENT_WITHDRAWN', ${cleanNote}, NULL)
      `);
      return updated;
    });
  }

  async history(societyId: string, consentId: string) {
    const consent = await this.find(societyId, consentId);
    if (!consent) throw new NotFoundException('Privacy consent record not found');
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e.*, actor."name" AS "actorName"
      FROM "PrivacyConsentEvent" e
      JOIN "User" actor ON actor."id" = e."actorUserId"
      WHERE e."societyId" = ${societyId}::uuid AND e."consentId" = ${consentId}::uuid
      ORDER BY e."createdAt" ASC
    `);
  }

  private async find(societyId: string, consentId: string) {
    const rows = await this.prisma.$queryRaw<ConsentRow[]>(Prisma.sql`
      SELECT * FROM "PrivacyConsentRecord"
      WHERE "id" = ${consentId}::uuid AND "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async assertActiveDataCategory(societyId: string, code: string) {
    const rows = await this.prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT "code" FROM "PrivacyDataCategory"
      WHERE "societyId" = ${societyId}::uuid AND "code" = ${code} AND "active" = true
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Consent data category must be active in the current society');
  }

  private async assertSocietyRelationship(societyId: string, userId: string, label: string) {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT relationship."userId" FROM (
        SELECT sm."userId" FROM "SocietyMembership" sm WHERE sm."societyId" = ${societyId}::uuid AND sm."userId" = ${userId}::uuid
        UNION ALL
        SELECT uo."userId" FROM "UnitOwnership" uo WHERE uo."societyId" = ${societyId}::uuid AND uo."userId" = ${userId}::uuid
        UNION ALL
        SELECT occ."userId" FROM "UnitOccupancy" occ WHERE occ."societyId" = ${societyId}::uuid AND occ."userId" = ${userId}::uuid
      ) relationship LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException(`${label} has no current or historical relationship with this society`);
  }
}
