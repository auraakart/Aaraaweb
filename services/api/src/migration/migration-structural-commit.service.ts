import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type StructuralEntityType = 'BUILDING' | 'UNIT';
type BatchHeader = {
  id: string;
  entityType: string;
  status: string;
  totalRows: number;
};
type BatchRow = {
  id: string;
  rowNumber: number;
  normalized: Record<string, string>;
  valid: boolean;
  targetId: string | null;
};

@Injectable()
export class MigrationStructuralCommitService {
  constructor(private readonly prisma: PrismaService) {}

  supports(entityType: string): entityType is StructuralEntityType {
    return entityType === 'BUILDING' || entityType === 'UNIT';
  }

  async commit(societyId: string, actorUserId: string, batchId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (batch.status !== 'READY') {
        throw new ConflictException('Only a READY migration batch can be committed');
      }
      if (!this.supports(batch.entityType)) {
        throw new ConflictException('This migration entity type is not enabled for controlled commit yet');
      }

      const rows = await this.loadRows(tx, batchId);
      if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || row.targetId)) {
        throw new ConflictException('Migration batch rows are not in a clean commit-ready state');
      }

      if (batch.entityType === 'BUILDING') {
        for (const row of rows) {
          const name = this.value(row.normalized, 'name');
          const code = this.value(row.normalized, 'code').toUpperCase();
          if (!name || !code) throw new BadRequestException('Committed building rows require both name and code');
          const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "Building" ("societyId","name","code")
            VALUES (${societyId}::uuid,${name},${code})
            RETURNING "id"
          `);
          await this.markRowCommitted(tx, row.id, 'Building', created[0].id);
        }
      } else {
        for (const row of rows) {
          const buildingRef = this.value(row.normalized, 'building_ref', 'building', 'building_code');
          const number = this.value(row.normalized, 'unit_number', 'number', 'flat_number');
          if (!buildingRef || !number) throw new BadRequestException('Committed unit rows require building_ref and unit_number');
          const buildings = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "Building"
            WHERE "societyId"=${societyId}::uuid
              AND (LOWER("code")=LOWER(${buildingRef}) OR LOWER("name")=LOWER(${buildingRef}))
            LIMIT 2
          `);
          if (buildings.length !== 1) {
            throw new ConflictException('Unit building reference must resolve to exactly one current-society building');
          }
          const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "Unit" ("societyId","buildingId","number")
            VALUES (${societyId}::uuid,${buildings[0].id}::uuid,${number})
            RETURNING "id"
          `);
          await this.markRowCommitted(tx, row.id, 'Unit', created[0].id);
        }
      }

      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='COMMITTED',"committedAt"=CURRENT_TIMESTAMP,
            "committedByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      return updated[0];
    }).catch((error) => this.translateDatabaseConflict(error));
  }

  async rollback(societyId: string, actorUserId: string, batchId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (batch.status !== 'COMMITTED') {
        throw new ConflictException('Only a COMMITTED migration batch can be rolled back');
      }
      if (!this.supports(batch.entityType)) {
        throw new ConflictException('This migration entity type is not enabled for controlled rollback yet');
      }

      const rows = await this.loadRows(tx, batchId);
      const targetIds = rows.map((row) => row.targetId).filter((id): id is string => !!id);
      if (targetIds.length !== rows.length) {
        throw new ConflictException('Committed migration evidence is incomplete; rollback is blocked');
      }

      const ids = Prisma.join(targetIds.map((id) => Prisma.sql`${id}::uuid`));
      if (batch.entityType === 'BUILDING') {
        const dependency = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
          SELECT EXISTS (
            SELECT 1 FROM "Unit"
            WHERE "societyId"=${societyId}::uuid AND "buildingId" IN (${ids})
          ) AS "blocked"
        `);
        if (dependency[0]?.blocked) {
          throw new ConflictException('Building rollback is blocked because units now depend on the migrated building');
        }
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "Building" WHERE "societyId"=${societyId}::uuid AND "id" IN (${ids})
        `);
      } else {
        const dependency = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
          SELECT EXISTS (
            SELECT 1 FROM "UnitOwnership" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "UnitOccupancy" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "Household" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "Visitor" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "AccessRequest" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "ServiceBooking" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "HelpdeskTicket" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "SosIncident" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
            UNION ALL SELECT 1 FROM "MaintenanceInvoice" WHERE "societyId"=${societyId}::uuid AND "unitId" IN (${ids})
          ) AS "blocked"
        `);
        if (dependency[0]?.blocked) {
          throw new ConflictException('Unit rollback is blocked because operational data now depends on a migrated unit');
        }
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "Unit" WHERE "societyId"=${societyId}::uuid AND "id" IN (${ids})
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow"
        SET "rolledBackAt"=CURRENT_TIMESTAMP
        WHERE "batchId"=${batchId}::uuid
      `);
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='ROLLED_BACK',"rolledBackAt"=CURRENT_TIMESTAMP,
            "rolledBackByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      return updated[0];
    });
  }

  private async loadBatchForUpdate(
    tx: Prisma.TransactionClient,
    societyId: string,
    batchId: string,
  ) {
    const batches = await tx.$queryRaw<BatchHeader[]>(Prisma.sql`
      SELECT "id","entityType","status","totalRows"
      FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid
      FOR UPDATE
    `);
    if (!batches[0]) throw new NotFoundException('Migration batch not found');
    return batches[0];
  }

  private loadRows(tx: Prisma.TransactionClient, batchId: string) {
    return tx.$queryRaw<BatchRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId"
      FROM "MigrationBatchRow"
      WHERE "batchId"=${batchId}::uuid
      ORDER BY "rowNumber"
    `);
  }

  private markRowCommitted(
    tx: Prisma.TransactionClient,
    rowId: string,
    targetType: string,
    targetId: string,
  ) {
    return tx.$executeRaw(Prisma.sql`
      UPDATE "MigrationBatchRow"
      SET "targetType"=${targetType},"targetId"=${targetId}::uuid,"committedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${rowId}::uuid
    `);
  }

  private value(row: Record<string, string>, ...keys: string[]) {
    return keys.map((key) => row[key]).find((item) => item?.trim())?.trim() ?? '';
  }

  private translateDatabaseConflict(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) {
      throw error;
    }
    const candidate = error as { code?: string; meta?: { code?: string } };
    if (candidate?.code === '23505' || candidate?.meta?.code === '23505') {
      throw new ConflictException('Migration commit conflicts with current society master data');
    }
    throw error;
  }
}
