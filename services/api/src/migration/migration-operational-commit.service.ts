import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DomesticWorkerRole, Prisma, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OperationalEntityType = 'VEHICLE' | 'PARKING' | 'WORKFORCE' | 'VENDOR';
type BatchHeader = { id: string; entityType: string; status: string; totalRows: number };
type BatchRow = { id: string; rowNumber: number; normalized: Record<string, string>; valid: boolean; targetId: string | null };

@Injectable()
export class MigrationOperationalCommitService {
  constructor(private readonly prisma: PrismaService) {}

  supports(entityType: string): entityType is OperationalEntityType {
    return ['VEHICLE', 'PARKING', 'WORKFORCE', 'VENDOR'].includes(entityType);
  }

  async commit(societyId: string, actorUserId: string, batchId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (batch.status !== 'READY') throw new ConflictException('Only a READY migration batch can be committed');
      if (!this.supports(batch.entityType)) throw new ConflictException('This migration entity type is not enabled for operational commit yet');
      const rows = await this.loadRows(tx, batchId);
      if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || row.targetId)) {
        throw new ConflictException('Migration batch rows are not in a clean commit-ready state');
      }

      for (const row of rows) {
        if (batch.entityType === 'VEHICLE') {
          const targetId = await this.commitVehicle(tx, societyId, row.normalized);
          await this.markRowCommitted(tx, row.id, 'HouseholdVehicle', targetId);
        } else if (batch.entityType === 'PARKING') {
          const targetId = await this.commitParking(tx, societyId, actorUserId, row.normalized);
          await this.markRowCommitted(tx, row.id, 'ParkingSlot', targetId);
        } else if (batch.entityType === 'WORKFORCE') {
          const targetId = await this.commitWorker(tx, societyId, row.normalized);
          await this.markRowCommitted(tx, row.id, 'DomesticWorker', targetId);
        } else {
          const targetId = await this.commitVendor(tx, societyId, actorUserId, row.normalized);
          await this.markRowCommitted(tx, row.id, 'SocietyVendor', targetId);
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
      if (batch.status !== 'COMMITTED') throw new ConflictException('Only a COMMITTED migration batch can be rolled back');
      if (!this.supports(batch.entityType)) throw new ConflictException('This migration entity type is not enabled for operational rollback yet');
      const rows = await this.loadRows(tx, batchId);
      const targetIds = rows.map((row) => row.targetId).filter((id): id is string => !!id);
      if (targetIds.length !== rows.length) throw new ConflictException('Committed migration evidence is incomplete; rollback is blocked');

      if (batch.entityType === 'VEHICLE') await this.rollbackVehicles(tx, societyId, targetIds);
      else if (batch.entityType === 'PARKING') await this.rollbackParking(tx, societyId, targetIds);
      else if (batch.entityType === 'WORKFORCE') await this.rollbackWorkers(tx, societyId, targetIds);
      else await this.rollbackVendors(tx, societyId, targetIds);

      await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow" SET "rolledBackAt"=CURRENT_TIMESTAMP WHERE "batchId"=${batchId}::uuid
      `);
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='ROLLED_BACK',"rolledBackAt"=CURRENT_TIMESTAMP,
            "rolledBackByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      return updated[0];
    }).catch((error) => this.translateDatabaseConflict(error));
  }

  private async commitVehicle(tx: Prisma.TransactionClient, societyId: string, row: Record<string, string>) {
    const unit = await this.resolveUnit(tx, societyId, this.value(row, 'unit_ref', 'unit', 'flat_number'));
    const household = await tx.household.findFirst({ where: { societyId, unitId: unit.id } });
    if (!household) throw new ConflictException('Vehicle migration requires an existing household for the referenced unit');
    const vehicle = await tx.householdVehicle.create({
      data: {
        societyId,
        householdId: household.id,
        plateNumber: this.value(row, 'registration_number', 'vehicle_number', 'registration').toUpperCase().replace(/[\s-]+/g, ''),
        vehicleType: this.value(row, 'vehicle_type', 'type').toUpperCase() as VehicleType,
        make: this.optional(row, 'make'),
        model: this.optional(row, 'model'),
        color: this.optional(row, 'color'),
      },
    });
    return vehicle.id;
  }

  private async commitParking(
    tx: Prisma.TransactionClient,
    societyId: string,
    actorUserId: string,
    row: Record<string, string>,
  ) {
    const buildingRef = this.value(row, 'building_ref', 'building', 'building_code');
    const buildingId = buildingRef ? (await this.resolveBuilding(tx, societyId, buildingRef)).id : null;
    const code = this.value(row, 'slot_code', 'parking_slot', 'slot').toUpperCase();
    const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "ParkingSlot" ("societyId","buildingId","code","label","slotType","evReady","locationNote")
      VALUES (
        ${societyId}::uuid,
        ${buildingId}::uuid,
        ${code},
        ${this.optional(row, 'label')},
        ${this.value(row, 'slot_type', 'type').toUpperCase() || 'RESIDENT'},
        ${this.parseBoolean(this.value(row, 'ev_ready', 'ev'))},
        ${this.optional(row, 'location_note', 'location')}
      )
      RETURNING "id"
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ParkingEvent" ("societyId","slotId","actorUserId","action","note")
      VALUES (${societyId}::uuid,${created[0].id}::uuid,${actorUserId}::uuid,'SLOT_CREATED','Imported by migration')
    `);
    return created[0].id;
  }

  private async commitWorker(tx: Prisma.TransactionClient, societyId: string, row: Record<string, string>) {
    const worker = await tx.domesticWorker.create({
      data: {
        societyId,
        name: this.value(row, 'name'),
        phone: this.value(row, 'phone', 'mobile', 'mobile_number').replace(/\s+/g, ''),
        role: this.value(row, 'worker_type', 'type', 'category').toUpperCase() as DomesticWorkerRole,
      },
    });
    return worker.id;
  }

  private async commitVendor(tx: Prisma.TransactionClient, societyId: string, actorUserId: string, row: Record<string, string>) {
    const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "SocietyVendor" ("societyId","code","name","category","contactName","phone","email","gstin","notes","createdByUserId")
      VALUES (
        ${societyId}::uuid,${this.value(row, 'code').toUpperCase()},${this.value(row, 'name', 'vendor_name')},
        ${this.value(row, 'category')},${this.optional(row, 'contact_name')},${this.optional(row, 'phone', 'mobile', 'mobile_number')},
        ${this.optional(row, 'email')},${this.optional(row, 'gstin')?.toUpperCase() ?? null},${this.optional(row, 'notes')},
        ${actorUserId}::uuid
      ) RETURNING "id"
    `);
    return created[0].id;
  }

  private async rollbackVehicles(tx: Prisma.TransactionClient, societyId: string, targetIds: string[]) {
    const ids = Prisma.join(targetIds.map((id) => Prisma.sql`${id}::uuid`));
    const blocked = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "ParkingAllocation" WHERE "societyId"=${societyId}::uuid AND "vehicleId" IN (${ids})
        UNION ALL
        SELECT 1 FROM "HouseholdChangeRequest" WHERE "societyId"=${societyId}::uuid AND "targetId" IN (${ids})
      ) AS "blocked"
    `);
    if (blocked[0]?.blocked) throw new ConflictException('Vehicle rollback is blocked because operational records depend on a migrated vehicle');
    await tx.householdVehicle.deleteMany({ where: { societyId, id: { in: targetIds } } });
  }

  private async rollbackParking(tx: Prisma.TransactionClient, societyId: string, targetIds: string[]) {
    const ids = Prisma.join(targetIds.map((id) => Prisma.sql`${id}::uuid`));
    const blocked = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "ParkingAllocation"
        WHERE "societyId"=${societyId}::uuid AND "slotId" IN (${ids})
      ) AS "blocked"
    `);
    if (blocked[0]?.blocked) {
      throw new ConflictException('Parking rollback is blocked because an allocation depends on a migrated slot');
    }
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "ParkingSlot"
      WHERE "societyId"=${societyId}::uuid AND "id" IN (${ids})
    `);
  }

  private async rollbackWorkers(tx: Prisma.TransactionClient, societyId: string, targetIds: string[]) {
    const [assignments, ratings, suspensionEvents] = await Promise.all([
      tx.workforceAssignment.count({ where: { societyId, workerId: { in: targetIds } } }),
      tx.workforceRating.count({ where: { societyId, workerId: { in: targetIds } } }),
      tx.workforceSuspensionEvent.count({ where: { societyId, workerId: { in: targetIds } } }),
    ]);
    if (assignments + ratings + suspensionEvents > 0) {
      throw new ConflictException('Workforce rollback is blocked because operational records depend on a migrated worker');
    }
    await tx.domesticWorker.deleteMany({ where: { societyId, id: { in: targetIds } } });
  }

  private async rollbackVendors(tx: Prisma.TransactionClient, societyId: string, targetIds: string[]) {
    const ids = Prisma.join(targetIds.map((id) => Prisma.sql`${id}::uuid`));
    const blocked = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "ProcurementRequest" WHERE "societyId"=${societyId}::uuid AND "preferredVendorId" IN (${ids})
        UNION ALL SELECT 1 FROM "ProcurementQuote" WHERE "societyId"=${societyId}::uuid AND "vendorId" IN (${ids})
        UNION ALL SELECT 1 FROM "PurchaseOrder" WHERE "societyId"=${societyId}::uuid AND "vendorId" IN (${ids})
      ) AS "blocked"
    `);
    if (blocked[0]?.blocked) throw new ConflictException('Vendor rollback is blocked because procurement records depend on a migrated vendor');
    await tx.$executeRaw(Prisma.sql`DELETE FROM "SocietyVendor" WHERE "societyId"=${societyId}::uuid AND "id" IN (${ids})`);
  }

  private async resolveBuilding(tx: Prisma.TransactionClient, societyId: string, rawRef: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Building"
      WHERE "societyId"=${societyId}::uuid
        AND (LOWER("code")=LOWER(${rawRef.trim()}) OR LOWER("name")=LOWER(${rawRef.trim()}))
      LIMIT 2
    `);
    if (rows.length !== 1) {
      throw new ConflictException('Building reference must resolve to exactly one current-society building');
    }
    return rows[0];
  }

  private async resolveUnit(tx: Prisma.TransactionClient, societyId: string, rawRef: string) {
    const split = rawRef.trim().split(/[|/:]/).map((item) => item.trim()).filter(Boolean);
    const rows = split.length >= 2
      ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT u."id" FROM "Unit" u JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
          WHERE u."societyId"=${societyId}::uuid AND LOWER(u."number")=LOWER(${split[split.length - 1]})
            AND (LOWER(b."code")=LOWER(${split[0]}) OR LOWER(b."name")=LOWER(${split[0]})) LIMIT 2
        `)
      : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Unit" WHERE "societyId"=${societyId}::uuid AND LOWER("number")=LOWER(${rawRef.trim()}) LIMIT 2
        `);
    if (rows.length !== 1) throw new ConflictException('Unit reference must resolve to exactly one current-society unit');
    return rows[0];
  }

  private async loadBatchForUpdate(tx: Prisma.TransactionClient, societyId: string, batchId: string) {
    const batches = await tx.$queryRaw<BatchHeader[]>(Prisma.sql`
      SELECT "id","entityType","status","totalRows" FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
    `);
    if (!batches[0]) throw new NotFoundException('Migration batch not found');
    return batches[0];
  }

  private loadRows(tx: Prisma.TransactionClient, batchId: string) {
    return tx.$queryRaw<BatchRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId" FROM "MigrationBatchRow"
      WHERE "batchId"=${batchId}::uuid ORDER BY "rowNumber"
    `);
  }

  private markRowCommitted(tx: Prisma.TransactionClient, rowId: string, targetType: string, targetId: string) {
    return tx.$executeRaw(Prisma.sql`
      UPDATE "MigrationBatchRow" SET "targetType"=${targetType},"targetId"=${targetId}::uuid,"committedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${rowId}::uuid
    `);
  }

  private value(row: Record<string, string>, ...keys: string[]) {
    return keys.map((key) => row[key]).find((item) => item?.trim())?.trim() ?? '';
  }
  private optional(row: Record<string, string>, ...keys: string[]) {
    const value = this.value(row, ...keys);
    return value || null;
  }

  private parseBoolean(value: string) {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  }
  private translateDatabaseConflict(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    const candidate = error as { code?: string; meta?: { code?: string } };
    if (candidate?.code === 'P2002' || candidate?.code === '23505' || candidate?.meta?.code === '23505') {
      throw new ConflictException('Migration commit conflicts with current society operational data');
    }
    throw error;
  }
}
