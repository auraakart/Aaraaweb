import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UtilityReadingKind } from './utilities.service';

type CreateIntegrationInput = { code: string; name: string };
type CreateMappingInput = { externalMeterId: string; meterId: string };
export type IntegrationReadingInput = {
  idempotencyKey: string;
  externalMeterId: string;
  readingAt: string;
  value: number;
  readingKind?: UtilityReadingKind;
  note?: string;
};

type NormalizedIntegrationReading = Omit<IntegrationReadingInput, 'readingKind' | 'note'> & {
  readingKind: UtilityReadingKind;
  note: string | null;
};

type IntegrationIdentity = {
  id: string;
  societyId: string;
  name: string;
  secretHash: string;
  status: 'ACTIVE' | 'REVOKED';
};

type QuarantineReason = { code: string; message: string };
type IngestionResult = {
  receiptId: string;
  status: 'ACCEPTED' | 'QUARANTINED';
  readingId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  replayed: boolean;
  conflict?: boolean;
};

@Injectable()
export class UtilityIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT i."id",i."code",i."name",i."status",i."createdAt",i."revokedAt",
        creator."name" AS "createdByName",
        COUNT(DISTINCT map."id") FILTER (WHERE map."active")::int AS "activeMappingCount",
        COUNT(DISTINCT receipt."id") FILTER (WHERE receipt."status"='QUARANTINED')::int AS "quarantinedCount"
      FROM "UtilityIntegration" i
      JOIN "User" creator ON creator."id"=i."createdByUserId"
      LEFT JOIN "UtilityIntegrationMeterMap" map ON map."integrationId"=i."id" AND map."societyId"=i."societyId"
      LEFT JOIN "UtilityIngestionReceipt" receipt ON receipt."integrationId"=i."id" AND receipt."societyId"=i."societyId"
      WHERE i."societyId"=${societyId}::uuid
      GROUP BY i."id",creator."name"
      ORDER BY i."status",i."createdAt" DESC
    `);
  }

  async create(societyId: string, actorUserId: string, input: CreateIntegrationInput) {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || code.length > 60) throw new BadRequestException('Integration code must be between 1 and 60 characters');
    if (!name || name.length > 120) throw new BadRequestException('Integration name must be between 1 and 120 characters');
    const secret = randomBytes(32).toString('base64url');
    const secretHash = this.hash(secret);
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; code: string; name: string; status: string; createdAt: Date }>>(Prisma.sql`
        INSERT INTO "UtilityIntegration" ("societyId","code","name","secretHash","createdByUserId")
        VALUES (${societyId}::uuid,${code},${name},${secretHash},${actorUserId}::uuid)
        RETURNING "id","code","name","status","createdAt"
      `);
      const integration = rows[0];
      return { ...integration, integrationKey: `${integration.id}.${secret}` };
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Integration code already exists in this society');
      throw error;
    }
  }

  async revoke(societyId: string, actorUserId: string, integrationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string; revokedAt: Date }>>(Prisma.sql`
      UPDATE "UtilityIntegration"
      SET "status"='REVOKED',"revokedByUserId"=${actorUserId}::uuid,"revokedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${integrationId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE'
      RETURNING "id","status","revokedAt"
    `);
    if (!rows[0]) throw new NotFoundException('Active utility integration not found');
    return rows[0];
  }

  async createMapping(societyId: string, actorUserId: string, integrationId: string, input: CreateMappingInput) {
    const externalMeterId = input.externalMeterId.trim();
    if (!externalMeterId || externalMeterId.length > 160) throw new BadRequestException('External meter ID must be between 1 and 160 characters');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const integrations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "UtilityIntegration"
          WHERE "id"=${integrationId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE'
          FOR UPDATE
        `);
        if (!integrations[0]) throw new NotFoundException('Active utility integration not found');
        const meters = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "UtilityMeter"
          WHERE "id"=${input.meterId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true
          FOR UPDATE
        `);
        if (!meters[0]) throw new NotFoundException('Active utility meter not found');
        const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          INSERT INTO "UtilityIntegrationMeterMap" (
            "societyId","integrationId","externalMeterId","meterId","createdByUserId"
          ) VALUES (
            ${societyId}::uuid,${integrationId}::uuid,${externalMeterId},${input.meterId}::uuid,${actorUserId}::uuid
          )
          RETURNING *
        `);
        return rows[0];
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('External meter ID is already mapped for this integration');
      throw error;
    }
  }

  listReceipts(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT receipt."id",receipt."idempotencyKey",receipt."externalMeterId",receipt."status",
        receipt."readingId",receipt."errorCode",receipt."errorMessage",receipt."receivedAt",
        integration."code" AS "integrationCode",integration."name" AS "integrationName",
        meter."code" AS "meterCode"
      FROM "UtilityIngestionReceipt" receipt
      JOIN "UtilityIntegration" integration
        ON integration."id"=receipt."integrationId" AND integration."societyId"=receipt."societyId"
      LEFT JOIN "UtilityReading" reading ON reading."id"=receipt."readingId" AND reading."societyId"=receipt."societyId"
      LEFT JOIN "UtilityMeter" meter ON meter."id"=reading."meterId" AND meter."societyId"=receipt."societyId"
      WHERE receipt."societyId"=${societyId}::uuid
      ORDER BY receipt."receivedAt" DESC
      LIMIT 500
    `);
  }

  async ingest(integrationKey: string | undefined, input: IntegrationReadingInput) {
    const identity = await this.authenticate(integrationKey);
    const idempotencyKey = input.idempotencyKey?.trim();
    const externalMeterId = input.externalMeterId?.trim();
    if (!idempotencyKey || idempotencyKey.length > 120) throw new BadRequestException('idempotencyKey must be between 1 and 120 characters');
    if (!externalMeterId || externalMeterId.length > 160) throw new BadRequestException('externalMeterId must be between 1 and 160 characters');

    const readingKind = input.readingKind ?? 'ACTUAL';
    const note = input.note?.trim() || null;
    const normalized = { idempotencyKey, externalMeterId, readingAt: input.readingAt, value: input.value, readingKind, note };
    const payloadHash = this.hash(JSON.stringify(normalized));
    const rawPayload = JSON.stringify(normalized);

    const result = await this.prisma.$transaction(async (tx): Promise<IngestionResult> => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identity.id}),hashtext(${idempotencyKey}))`);
      const active = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "UtilityIntegration"
        WHERE "id"=${identity.id}::uuid AND "societyId"=${identity.societyId}::uuid AND "status"='ACTIVE'
        FOR UPDATE
      `);
      if (!active[0]) throw new UnauthorizedException('Utility integration is inactive');

      const existing = await tx.$queryRaw<Array<{
        id: string; payloadHash: string; status: 'ACCEPTED' | 'QUARANTINED'; readingId: string | null;
        errorCode: string | null; errorMessage: string | null;
      }>>(Prisma.sql`
        SELECT "id","payloadHash","status","readingId","errorCode","errorMessage"
        FROM "UtilityIngestionReceipt"
        WHERE "integrationId"=${identity.id}::uuid AND "idempotencyKey"=${idempotencyKey}
      `);
      if (existing[0]) {
        const samePayload = existing[0].payloadHash === payloadHash;
        await this.recordAttempt(tx, identity, existing[0].id, idempotencyKey, payloadHash, samePayload ? 'REPLAY' : 'IDEMPOTENCY_CONFLICT');
        return { ...existing[0], receiptId: existing[0].id, replayed: samePayload, conflict: !samePayload };
      }

      const invalid = this.validateReading(normalized);
      if (invalid) return this.quarantine(tx, identity, normalized, payloadHash, rawPayload, invalid);

      const mappings = await tx.$queryRaw<Array<{ meterId: string; meterActive: boolean }>>(Prisma.sql`
        SELECT map."meterId",meter."active" AS "meterActive"
        FROM "UtilityIntegrationMeterMap" map
        JOIN "UtilityMeter" meter ON meter."id"=map."meterId" AND meter."societyId"=map."societyId"
        WHERE map."integrationId"=${identity.id}::uuid
          AND map."societyId"=${identity.societyId}::uuid
          AND map."externalMeterId"=${externalMeterId}
          AND map."active"=true
      `);
      if (!mappings[0]) {
        return this.quarantine(tx, identity, normalized, payloadHash, rawPayload, {
          code: 'METER_MAPPING_NOT_FOUND',
          message: 'External meter ID is not mapped for this integration',
        });
      }
      if (!mappings[0].meterActive) {
        return this.quarantine(tx, identity, normalized, payloadHash, rawPayload, {
          code: 'METER_INACTIVE',
          message: 'Mapped utility meter is inactive',
        });
      }

      const meterId = mappings[0].meterId;
      await tx.$executeRaw(Prisma.sql`
        SELECT 1 FROM "UtilityMeter"
        WHERE "id"=${meterId}::uuid AND "societyId"=${identity.societyId}::uuid
        FOR UPDATE
      `);
      const readingAt = new Date(normalized.readingAt);
      const collision = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "UtilityReading"
        WHERE "meterId"=${meterId}::uuid AND "readingAt"=${readingAt}
      `);
      if (collision[0]) {
        return this.quarantine(tx, identity, normalized, payloadHash, rawPayload, {
          code: 'TIMESTAMP_ALREADY_EXISTS',
          message: 'A reading already exists for the mapped meter at this timestamp',
        });
      }

      if (readingKind === 'ACTUAL') {
        const previous = await tx.$queryRaw<Array<{ value: string }>>(Prisma.sql`
          SELECT "value"::text AS "value" FROM "UtilityReading"
          WHERE "societyId"=${identity.societyId}::uuid AND "meterId"=${meterId}::uuid AND "readingAt"<${readingAt}
          ORDER BY "readingAt" DESC LIMIT 1
        `);
        const next = await tx.$queryRaw<Array<{ value: string; readingKind: UtilityReadingKind }>>(Prisma.sql`
          SELECT "value"::text AS "value","readingKind" FROM "UtilityReading"
          WHERE "societyId"=${identity.societyId}::uuid AND "meterId"=${meterId}::uuid AND "readingAt">${readingAt}
          ORDER BY "readingAt" ASC LIMIT 1
        `);
        if (previous[0] && normalized.value < Number(previous[0].value)) {
          return this.quarantine(tx, identity, normalized, payloadHash, rawPayload, {
            code: 'READING_DECREASE',
            message: 'ACTUAL reading is lower than the previous reading; submit a documented RESET instead',
          });
        }
        if (next[0]?.readingKind !== 'RESET' && next[0] && normalized.value > Number(next[0].value)) {
          return this.quarantine(tx, identity, normalized, payloadHash, rawPayload, {
            code: 'READING_EXCEEDS_NEXT',
            message: 'Reading is higher than the next recorded reading',
          });
        }
      }

      const readings = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "UtilityReading" (
          "societyId","meterId","readingAt","value","readingKind","source","note","recordedByUserId","integrationId"
        ) VALUES (
          ${identity.societyId}::uuid,${meterId}::uuid,${readingAt},${normalized.value},${readingKind},
          'INTEGRATION',${note},NULL,${identity.id}::uuid
        ) RETURNING "id"
      `);
      const readingId = readings[0].id;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UtilityEvent" (
          "societyId","meterId","readingId","actorUserId","actorSource","integrationId","action","note"
        ) VALUES (
          ${identity.societyId}::uuid,${meterId}::uuid,${readingId}::uuid,NULL,'INTEGRATION',${identity.id}::uuid,
          'READING_RECORDED',${note}
        )
      `);
      const receipts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "UtilityIngestionReceipt" (
          "societyId","integrationId","idempotencyKey","payloadHash","externalMeterId","status","readingId","rawPayload"
        ) VALUES (
          ${identity.societyId}::uuid,${identity.id}::uuid,${idempotencyKey},${payloadHash},${externalMeterId},
          'ACCEPTED',${readingId}::uuid,${rawPayload}::jsonb
        ) RETURNING "id"
      `);
      await this.recordAttempt(tx, identity, receipts[0].id, idempotencyKey, payloadHash, 'ACCEPTED');
      return { receiptId: receipts[0].id, status: 'ACCEPTED', readingId, errorCode: null, errorMessage: null, replayed: false };
    });

    if (result.conflict) throw new ConflictException('Idempotency key was already used with a different payload');
    return result;
  }

  private async authenticate(integrationKey: string | undefined): Promise<IntegrationIdentity> {
    if (!integrationKey) throw new UnauthorizedException('Utility integration key is required');
    const separator = integrationKey.indexOf('.');
    if (separator <= 0 || separator === integrationKey.length - 1) throw new UnauthorizedException('Utility integration key is invalid');
    const integrationId = integrationKey.slice(0, separator);
    const secret = integrationKey.slice(separator + 1);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(integrationId)) {
      throw new UnauthorizedException('Utility integration key is invalid');
    }
    const rows = await this.prisma.$queryRaw<IntegrationIdentity[]>(Prisma.sql`
      SELECT "id","societyId","name","secretHash","status"
      FROM "UtilityIntegration"
      WHERE "id"=${integrationId}::uuid
    `);
    const identity = rows[0];
    if (!identity || identity.status !== 'ACTIVE') throw new UnauthorizedException('Utility integration key is invalid');
    const expected = Buffer.from(identity.secretHash, 'hex');
    const actual = Buffer.from(this.hash(secret), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException('Utility integration key is invalid');
    return identity;
  }

  private validateReading(input: NormalizedIntegrationReading): QuarantineReason | null {
    const readingAt = new Date(input.readingAt);
    if (!Number.isFinite(readingAt.getTime())) return { code: 'INVALID_TIMESTAMP', message: 'readingAt must be a valid ISO-8601 timestamp' };
    if (!Number.isFinite(input.value) || input.value < 0) return { code: 'INVALID_VALUE', message: 'value must be a non-negative number' };
    if (input.readingKind !== 'ACTUAL' && input.readingKind !== 'RESET') return { code: 'INVALID_KIND', message: 'readingKind must be ACTUAL or RESET' };
    if (input.note && input.note.length > 300) return { code: 'NOTE_TOO_LONG', message: 'note must be at most 300 characters' };
    if (input.readingKind === 'RESET' && !input.note) return { code: 'RESET_NOTE_REQUIRED', message: 'RESET readings require a note' };
    return null;
  }

  private async quarantine(
    tx: Prisma.TransactionClient,
    identity: IntegrationIdentity,
    input: NormalizedIntegrationReading,
    payloadHash: string,
    rawPayload: string,
    reason: QuarantineReason,
  ): Promise<IngestionResult> {
    const receipts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "UtilityIngestionReceipt" (
        "societyId","integrationId","idempotencyKey","payloadHash","externalMeterId","status",
        "errorCode","errorMessage","rawPayload"
      ) VALUES (
        ${identity.societyId}::uuid,${identity.id}::uuid,${input.idempotencyKey},${payloadHash},${input.externalMeterId},
        'QUARANTINED',${reason.code},${reason.message},${rawPayload}::jsonb
      ) RETURNING "id"
    `);
    await this.recordAttempt(tx, identity, receipts[0].id, input.idempotencyKey, payloadHash, 'QUARANTINED');
    return {
      receiptId: receipts[0].id,
      status: 'QUARANTINED',
      readingId: null,
      errorCode: reason.code,
      errorMessage: reason.message,
      replayed: false,
    };
  }

  private recordAttempt(
    tx: Prisma.TransactionClient,
    identity: IntegrationIdentity,
    receiptId: string | null,
    idempotencyKey: string,
    payloadHash: string,
    outcome: 'ACCEPTED' | 'QUARANTINED' | 'REPLAY' | 'IDEMPOTENCY_CONFLICT',
  ) {
    return tx.$executeRaw(Prisma.sql`
      INSERT INTO "UtilityIngestionAttempt" (
        "societyId","integrationId","receiptId","idempotencyKey","payloadHash","outcome"
      ) VALUES (
        ${identity.societyId}::uuid,${identity.id}::uuid,${receiptId}::uuid,${idempotencyKey},${payloadHash},${outcome}
      )
    `);
  }

  private hash(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
