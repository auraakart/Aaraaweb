import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MigrationEntityType,
  MigrationPreviewIssue,
  MigrationPreviewService,
} from './migration-preview.service';

export type MigrationReferenceIssueCode =
  | 'REFERENCE_MISSING'
  | 'REFERENCE_AMBIGUOUS'
  | 'EXISTING_CONFLICT';

export interface MigrationReferenceIssue extends Omit<MigrationPreviewIssue, 'code'> {
  code: MigrationReferenceIssueCode;
}

type AnyIssue = MigrationPreviewIssue | MigrationReferenceIssue;

interface ReferenceSnapshot {
  buildings: Array<{ code: string; name: string }>;
  units: Array<{ number: string; buildingCode: string; buildingName: string }>;
  accounts: Array<{ code: string }>;
  vehicles: Array<{ plateNumber: string }>;
  workers: Array<{ phone: string }>;
  vendors: Array<{ code: string; name: string; gstin: string | null }>;
  parkingSlots: Array<{ code: string }>;
  residentRelations: Array<{ phone: string; unitNumber: string; buildingCode: string; buildingName: string; relation: string }>;
  funds?: Array<{ code: string; name: string }>;
  periods?: Array<{ startsOn: Date; endsOn: Date; status: string }>;
}

type BatchRow = {
  rowNumber: number;
  normalized: Record<string, string>;
  identityKey: string;
  valid: boolean;
  issues: AnyIssue[];
};

@Injectable()
export class MigrationBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previewService: MigrationPreviewService,
  ) {}

  async createPreviewBatch(
    societyId: string,
    actorUserId: string,
    entityType: MigrationEntityType,
    inputRows: Record<string, unknown>[],
    sourceLabel?: string,
  ) {
    const preview = this.previewService.preview(entityType, inputRows);
    const references = await this.loadReferenceSnapshot(societyId);
    const referenceIssues = this.validateReferences(entityType, preview.normalizedRows, references);
    const issues: AnyIssue[] = [...preview.issues, ...referenceIssues];
    const invalidRows = new Set(issues.map((issue) => issue.row));
    const checksum = this.checksum(entityType, preview.normalizedRows);
    const rows: BatchRow[] = preview.normalizedRows.map((normalized, index) => {
      const rowNumber = index + 1;
      const rowIssues = issues.filter((issue) => issue.row === rowNumber);
      return {
        rowNumber,
        normalized,
        identityKey: this.identityKey(entityType, normalized),
        valid: rowIssues.length === 0,
        issues: rowIssues,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${societyId}), hashtext(${checksum}))`);
      const existing = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM "MigrationBatch"
        WHERE "societyId"=${societyId}::uuid AND "checksum"=${checksum}
        LIMIT 1
      `);
      if (existing[0]) return { ...existing[0], idempotentReplay: true };

      const batchRows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "MigrationBatch" (
          "societyId","actorUserId","entityType","sourceLabel","status","checksum",
          "totalRows","validRows","invalidRows","duplicateRows","referentialIssueCount","issues"
        ) VALUES (
          ${societyId}::uuid,${actorUserId}::uuid,${entityType},${sourceLabel?.trim() || null},
          ${invalidRows.size === 0 ? 'READY' : 'PREVIEWED'},${checksum},
          ${preview.totalRows},${preview.totalRows - invalidRows.size},${invalidRows.size},
          ${preview.duplicateRows},${referenceIssues.length},
          CAST(${JSON.stringify(issues)} AS jsonb)
        )
        RETURNING *
      `);
      const batch = batchRows[0];
      const payload = JSON.stringify(rows);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "MigrationBatchRow" ("batchId","rowNumber","normalized","identityKey","valid","issues")
        SELECT
          ${String(batch.id)}::uuid,
          (item->>'rowNumber')::integer,
          item->'normalized',
          NULLIF(item->>'identityKey',''),
          (item->>'valid')::boolean,
          item->'issues'
        FROM jsonb_array_elements(CAST(${payload} AS jsonb)) AS item
      `);
      return { ...batch, idempotentReplay: false };
    });
  }

  listBatches(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id","entityType","sourceLabel","status","checksum","totalRows","validRows","invalidRows",
             "duplicateRows","referentialIssueCount","createdAt","updatedAt"
      FROM "MigrationBatch"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "createdAt" DESC
      LIMIT 100
    `);
  }

  async getBatch(societyId: string, batchId: string) {
    const batches = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT * FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid
      LIMIT 1
    `);
    if (!batches[0]) throw new NotFoundException('Migration batch not found');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id","rowNumber","normalized","identityKey","valid","issues","targetType","targetId","committedAt","rolledBackAt"
      FROM "MigrationBatchRow"
      WHERE "batchId"=${batchId}::uuid
      ORDER BY "rowNumber"
    `);
    const artifacts = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a."rowId",a."artifactType",a."artifactId",a."createdByMigration",a."metadata",a."createdAt",a."rolledBackAt"
      FROM "MigrationBatchArtifact" a
      JOIN "MigrationBatchRow" r ON r."id"=a."rowId"
      WHERE r."batchId"=${batchId}::uuid
      ORDER BY a."createdAt"
    `);
    return { ...batches[0], rows, artifacts };
  }

  validateReferences(
    entityType: MigrationEntityType,
    rows: Record<string, string>[],
    snapshot: ReferenceSnapshot,
  ): MigrationReferenceIssue[] {
    const issues: MigrationReferenceIssue[] = [];
    const buildings = snapshot.buildings.map((item) => ({
      code: this.norm(item.code),
      name: this.norm(item.name),
    }));
    const units = snapshot.units.map((item) => ({
      number: this.norm(item.number),
      buildingCode: this.norm(item.buildingCode),
      buildingName: this.norm(item.buildingName),
    }));
    const accountCodes = new Set(snapshot.accounts.map((item) => this.norm(item.code)));
    const vehiclePlates = new Set(snapshot.vehicles.map((item) => this.normPlate(item.plateNumber)));
    const workerPhones = new Set(snapshot.workers.map((item) => this.norm(item.phone)));
    const vendorIdentities = new Set(snapshot.vendors.flatMap((item) =>
      [item.code, item.gstin ?? '', item.name].map((value) => this.norm(value)).filter(Boolean),
    ));
    const parkingSlotCodes = new Set(snapshot.parkingSlots.map((item) => this.norm(item.code)));
    const residentRelations = snapshot.residentRelations.map((item) => ({
      phone: this.norm(item.phone),
      unitNumber: this.norm(item.unitNumber),
      buildingCode: this.norm(item.buildingCode),
      buildingName: this.norm(item.buildingName),
      relation: item.relation.toUpperCase(),
    }));

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const value = (...keys: string[]) =>
        keys.map((key) => row[key]).find((item) => item?.trim())?.trim() ?? '';

      if (entityType === 'BUILDING') {
        const ref = this.norm(value('code') || value('name'));
        if (ref && buildings.some((item) => item.code === ref || item.name === ref)) {
          issues.push({ row: rowNumber, field: 'code', code: 'EXISTING_CONFLICT', message: 'Building already exists in this society' });
        }
      }

      if (entityType === 'UNIT') {
        const buildingRef = value('building_ref', 'building', 'building_code');
        const matches = buildings.filter((item) => [item.code, item.name].includes(this.norm(buildingRef)));
        if (buildingRef && matches.length === 0) {
          issues.push({ row: rowNumber, field: 'building_ref', code: 'REFERENCE_MISSING', message: 'Referenced building does not exist in this society' });
        } else if (buildingRef && matches.length > 1) {
          issues.push({ row: rowNumber, field: 'building_ref', code: 'REFERENCE_AMBIGUOUS', message: 'Referenced building is ambiguous' });
        } else if (matches.length === 1) {
          const unitNumber = this.norm(value('unit_number', 'number', 'flat_number'));
          if (unitNumber && units.some((unit) => unit.number === unitNumber && [unit.buildingCode, unit.buildingName].includes(this.norm(buildingRef)))) {
            issues.push({ row: rowNumber, field: 'unit_number', code: 'EXISTING_CONFLICT', message: 'Unit already exists in the referenced building' });
          }
        }
      }

      if (['RESIDENT', 'VEHICLE'].includes(entityType)) {
        const unitRef = value('unit_ref', 'unit', 'flat_number');
        if (unitRef) issues.push(...this.unitReferenceIssues(rowNumber, unitRef, units));
        if (entityType === 'RESIDENT' && unitRef) {
          const phone = this.norm(value('phone', 'mobile', 'mobile_number'));
          const ref = this.norm(unitRef);
          const split = ref.split(/[|/:]/).map((item) => item.trim()).filter(Boolean);
          const existing = residentRelations.some((item) => {
            const unitMatches = split.length >= 2
              ? item.unitNumber === split[split.length - 1] && [item.buildingCode, item.buildingName].includes(split[0])
              : item.unitNumber === ref;
            return item.phone === phone && unitMatches;
          });
          if (phone && existing) {
            issues.push({ row: rowNumber, field: 'phone', code: 'EXISTING_CONFLICT', message: 'Resident already has an active relationship with the referenced unit' });
          }
        }
      }

      if (entityType === 'PARKING') {
        const buildingRef = value('building_ref', 'building', 'building_code');
        if (buildingRef) {
          const matches = buildings.filter((item) => [item.code, item.name].includes(this.norm(buildingRef)));
          if (matches.length === 0) {
            issues.push({ row: rowNumber, field: 'building_ref', code: 'REFERENCE_MISSING', message: 'Referenced parking building does not exist in this society' });
          } else if (matches.length > 1) {
            issues.push({ row: rowNumber, field: 'building_ref', code: 'REFERENCE_AMBIGUOUS', message: 'Referenced parking building is ambiguous' });
          }
        }
        const slotCode = this.norm(value('slot_code', 'parking_slot', 'slot'));
        if (slotCode && parkingSlotCodes.has(slotCode)) {
          issues.push({ row: rowNumber, field: 'slot_code', code: 'EXISTING_CONFLICT', message: 'Parking slot already exists in this society' });
        }
      }

      if (entityType === 'VEHICLE') {
        const plate = this.normPlate(value('registration_number', 'vehicle_number', 'registration'));
        if (plate && vehiclePlates.has(plate)) {
          issues.push({ row: rowNumber, field: 'registration_number', code: 'EXISTING_CONFLICT', message: 'Vehicle already exists in this society' });
        }
      }

      if (entityType === 'WORKFORCE') {
        const phone = this.norm(value('phone', 'mobile', 'mobile_number'));
        if (phone && workerPhones.has(phone)) {
          issues.push({ row: rowNumber, field: 'phone', code: 'EXISTING_CONFLICT', message: 'Workforce member already exists in this society' });
        }
      }

      if (entityType === 'VENDOR') {
        const identity = this.norm(value('code') || value('gstin') || value('name', 'vendor_name'));
        if (identity && vendorIdentities.has(identity)) {
          issues.push({ row: rowNumber, field: 'name', code: 'EXISTING_CONFLICT', message: 'Vendor already exists in this society' });
        }
      }

      if (entityType === 'OPENING_BALANCE') {
        const accountCode = this.norm(value('account_code', 'ledger_code', 'account'));
        if (accountCode && !accountCodes.has(accountCode)) {
          issues.push({ row: rowNumber, field: 'account_code', code: 'REFERENCE_MISSING', message: 'Ledger account does not exist in this society' });
        }
        const unitRef = value('unit_ref', 'unit', 'flat_number');
        if (unitRef) issues.push(...this.unitReferenceIssues(rowNumber, unitRef, units));

        const fundRef = this.norm(value('fund_ref', 'fund'));
        if (fundRef && snapshot.funds) {
          const matches = snapshot.funds.filter((fund) => [this.norm(fund.code), this.norm(fund.name)].includes(fundRef));
          if (matches.length === 0) {
            issues.push({ row: rowNumber, field: 'fund_ref', code: 'REFERENCE_MISSING', message: 'Accounting fund does not exist in this society' });
          } else if (matches.length > 1) {
            issues.push({ row: rowNumber, field: 'fund_ref', code: 'REFERENCE_AMBIGUOUS', message: 'Accounting fund reference is ambiguous' });
          }
        }

        const entryDate = value('entry_date', 'cutover_date');
        if (entryDate && snapshot.periods) {
          const matches = snapshot.periods.filter((period) => {
            if (period.status !== 'OPEN') return false;
            const start = period.startsOn.toISOString().slice(0, 10);
            const end = period.endsOn.toISOString().slice(0, 10);
            return entryDate >= start && entryDate <= end;
          });
          if (matches.length === 0) {
            issues.push({ row: rowNumber, field: 'entry_date', code: 'REFERENCE_MISSING', message: 'entry_date is not covered by an open accounting period' });
          } else if (matches.length > 1) {
            issues.push({ row: rowNumber, field: 'entry_date', code: 'REFERENCE_AMBIGUOUS', message: 'entry_date resolves to multiple open accounting periods' });
          }
        }
      }
    });

    return issues;
  }

  checksum(entityType: MigrationEntityType, rows: Record<string, string>[]) {
    const canonicalRows = rows.map((row) => Object.fromEntries(
      Object.keys(row).sort().map((key) => [key, row[key]]),
    ));
    return createHash('sha256').update(JSON.stringify({ entityType, rows: canonicalRows })).digest('hex');
  }

  private async loadReferenceSnapshot(societyId: string): Promise<ReferenceSnapshot> {
    const [buildings, units, accounts, vehicles, workers, vendors, parkingSlots, residentRelations, funds, periods] = await Promise.all([
      this.prisma.$queryRaw<Array<{ code: string; name: string }>>(Prisma.sql`
        SELECT "code","name" FROM "Building" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{ number: string; buildingCode: string; buildingName: string }>>(Prisma.sql`
        SELECT u."number",b."code" AS "buildingCode",b."name" AS "buildingName"
        FROM "Unit" u JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
        WHERE u."societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
        SELECT "code" FROM "LedgerAccount" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
      `),
      this.prisma.$queryRaw<Array<{ plateNumber: string }>>(Prisma.sql`
        SELECT "plateNumber" FROM "HouseholdVehicle" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{ phone: string }>>(Prisma.sql`
        SELECT "phone" FROM "DomesticWorker" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{ code: string; name: string; gstin: string | null }>>(Prisma.sql`
        SELECT "code","name","gstin" FROM "SocietyVendor" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
        SELECT "code" FROM "ParkingSlot" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{ phone: string; unitNumber: string; buildingCode: string; buildingName: string; relation: string }>>(Prisma.sql`
        SELECT usr."phone", un."number" AS "unitNumber", b."code" AS "buildingCode", b."name" AS "buildingName", 'OWNER'::text AS "relation"
        FROM "UnitOwnership" rel
        JOIN "User" usr ON usr."id"=rel."userId"
        JOIN "Unit" un ON un."id"=rel."unitId" AND un."societyId"=rel."societyId"
        JOIN "Building" b ON b."id"=un."buildingId" AND b."societyId"=un."societyId"
        WHERE rel."societyId"=${societyId}::uuid AND rel."active"=TRUE
        UNION ALL
        SELECT usr."phone", un."number" AS "unitNumber", b."code" AS "buildingCode", b."name" AS "buildingName", rel."relation"::text AS "relation"
        FROM "UnitOccupancy" rel
        JOIN "User" usr ON usr."id"=rel."userId"
        JOIN "Unit" un ON un."id"=rel."unitId" AND un."societyId"=rel."societyId"
        JOIN "Building" b ON b."id"=un."buildingId" AND b."societyId"=un."societyId"
        WHERE rel."societyId"=${societyId}::uuid AND rel."active"=TRUE
      `),
      this.prisma.$queryRaw<Array<{ code: string; name: string }>>(Prisma.sql`
        SELECT "code","name" FROM "AccountingFund"
        WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
      `),
      this.prisma.$queryRaw<Array<{ startsOn: Date; endsOn: Date; status: string }>>(Prisma.sql`
        SELECT "startsOn","endsOn","status"::text AS "status" FROM "AccountingPeriod"
        WHERE "societyId"=${societyId}::uuid
      `),
    ]);
    return { buildings, units, accounts, vehicles, workers, vendors, parkingSlots, residentRelations, funds, periods };
  }

  private unitReferenceIssues(
    row: number,
    rawRef: string,
    units: Array<{ number: string; buildingCode: string; buildingName: string }>,
  ): MigrationReferenceIssue[] {
    const ref = this.norm(rawRef);
    const split = ref.split(/[|/:]/).map((item) => item.trim()).filter(Boolean);
    const matches = split.length >= 2
      ? units.filter((unit) => unit.number === split[split.length - 1] && [unit.buildingCode, unit.buildingName].includes(split[0]))
      : units.filter((unit) => unit.number === ref);
    if (matches.length === 0) {
      return [{ row, field: 'unit_ref', code: 'REFERENCE_MISSING', message: 'Referenced unit does not exist in this society' }];
    }
    if (matches.length > 1) {
      return [{ row, field: 'unit_ref', code: 'REFERENCE_AMBIGUOUS', message: 'Unit reference is ambiguous; use BUILDING_CODE/UNIT_NUMBER' }];
    }
    return [];
  }

  private identityKey(entityType: MigrationEntityType, row: Record<string, string>) {
    const value = (...keys: string[]) =>
      keys.map((key) => row[key]).find((item) => item?.trim())?.trim().toLowerCase() ?? '';
    switch (entityType) {
      case 'BUILDING': return value('external_id') || value('code') || value('name');
      case 'UNIT': return `${value('building_ref', 'building', 'building_code')}|${value('unit_number', 'number', 'flat_number')}`;
      case 'RESIDENT': return `${value('phone', 'mobile', 'mobile_number')}|${value('unit_ref', 'unit', 'flat_number')}`;
      case 'VEHICLE': return this.normPlate(value('registration_number', 'vehicle_number', 'registration'));
      case 'PARKING': return value('slot_code', 'parking_slot', 'slot');
      case 'WORKFORCE': return value('external_id') || value('phone', 'mobile', 'mobile_number');
      case 'VENDOR': return value('code') || value('gstin') || value('external_id') || value('name', 'vendor_name');
      case 'OPENING_BALANCE': return `${value('account_code', 'ledger_code', 'account')}|${value('unit_ref', 'unit', 'flat_number')}|${value('fund_ref', 'fund')}`;
    }
  }

  private norm(value: string) {
    return value.trim().toLowerCase();
  }

  private normPlate(value: string) {
    return value.trim().toLowerCase().replace(/[\s-]+/g, '');
  }
}
