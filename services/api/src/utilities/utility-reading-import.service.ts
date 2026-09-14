import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UtilityReadingKind } from './utilities.service';

export type UtilityReadingImportRow = {
  meterCode: string;
  readingAt: string;
  value: number;
  readingKind?: UtilityReadingKind;
  note?: string;
};

type PreparedRow = {
  index: number;
  meterCode: string;
  meterId?: string;
  readingAt: Date;
  value: number;
  readingKind: UtilityReadingKind;
  note: string | null;
};

type ValidationError = {
  index: number;
  meterCode: string;
  code: string;
  message: string;
};

type QueryClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class UtilityReadingImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(societyId: string, rows: UtilityReadingImportRow[]) {
    return this.validate(societyId, rows, this.prisma);
  }

  async commit(societyId: string, actorUserId: string, rows: UtilityReadingImportRow[]) {
    return this.prisma.$transaction(async (tx) => {
      const preview = await this.validate(societyId, rows, tx, true);
      if (!preview.valid) {
        throw new BadRequestException({
          message: 'Utility reading import contains validation errors',
          errors: preview.errors,
        });
      }

      const prepared = preview.prepared;
      const insertedIds: string[] = [];
      for (const row of prepared) {
        const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UtilityReading" (
            "societyId","meterId","readingAt","value","readingKind","source","note","recordedByUserId"
          ) VALUES (
            ${societyId}::uuid,${row.meterId}::uuid,${row.readingAt},${row.value},${row.readingKind},'IMPORT',${row.note},${actorUserId}::uuid
          ) RETURNING "id"
        `);
        const readingId = inserted[0].id;
        insertedIds.push(readingId);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UtilityEvent" ("societyId","meterId","readingId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${row.meterId}::uuid,${readingId}::uuid,${actorUserId}::uuid,'READING_RECORDED',${row.note})
        `);
      }

      return {
        imported: insertedIds.length,
        readingIds: insertedIds,
        source: 'IMPORT' as const,
      };
    });
  }

  private async validate(societyId: string, inputRows: UtilityReadingImportRow[], client: QueryClient, lockMeters = false) {
    if (!Array.isArray(inputRows) || inputRows.length === 0) {
      throw new BadRequestException('At least one utility reading is required');
    }
    if (inputRows.length > 1000) {
      throw new BadRequestException('A utility reading import cannot exceed 1000 rows');
    }

    const errors: ValidationError[] = [];
    const prepared: PreparedRow[] = inputRows.map((row, index) => {
      const meterCode = row.meterCode?.trim().toUpperCase() ?? '';
      const readingAt = new Date(row.readingAt);
      const readingKind = row.readingKind ?? 'ACTUAL';
      const note = row.note?.trim() || null;

      if (!meterCode || meterCode.length > 60) errors.push(this.error(index, meterCode, 'INVALID_METER_CODE', 'Meter code is required and must be at most 60 characters'));
      if (!Number.isFinite(readingAt.getTime())) errors.push(this.error(index, meterCode, 'INVALID_TIMESTAMP', 'Reading timestamp is invalid'));
      if (!Number.isFinite(row.value) || row.value < 0) errors.push(this.error(index, meterCode, 'INVALID_VALUE', 'Reading value must be a non-negative number'));
      if (readingKind !== 'ACTUAL' && readingKind !== 'RESET') errors.push(this.error(index, meterCode, 'INVALID_KIND', 'Reading kind must be ACTUAL or RESET'));
      if (note && note.length > 300) errors.push(this.error(index, meterCode, 'NOTE_TOO_LONG', 'Reading note must be at most 300 characters'));
      if (readingKind === 'RESET' && !note) errors.push(this.error(index, meterCode, 'RESET_NOTE_REQUIRED', 'RESET readings require a note explaining the reset or meter replacement'));

      return { index, meterCode, readingAt, value: row.value, readingKind, note };
    });

    const seen = new Map<string, number>();
    for (const row of prepared) {
      if (!Number.isFinite(row.readingAt.getTime()) || !row.meterCode) continue;
      const key = `${row.meterCode}|${row.readingAt.toISOString()}`;
      const first = seen.get(key);
      if (first !== undefined) {
        errors.push(this.error(row.index, row.meterCode, 'DUPLICATE_BATCH_TIMESTAMP', `Duplicates row ${first + 1} for the same meter and timestamp`));
      } else {
        seen.set(key, row.index);
      }
    }

    const codes = [...new Set(prepared.map((row) => row.meterCode).filter(Boolean))];
    if (codes.length === 0 || errors.some((item) => item.code === 'INVALID_TIMESTAMP')) {
      return { valid: false, rowCount: inputRows.length, errors, prepared: [] as PreparedRow[] };
    }

    const meters = await client.$queryRaw<Array<{ id: string; code: string; active: boolean }>>(lockMeters ? Prisma.sql`
      SELECT "id","code","active" FROM "UtilityMeter"
      WHERE "societyId"=${societyId}::uuid AND "code" IN (${Prisma.join(codes)})
      FOR UPDATE
    ` : Prisma.sql`
      SELECT "id","code","active" FROM "UtilityMeter"
      WHERE "societyId"=${societyId}::uuid AND "code" IN (${Prisma.join(codes)})
    `);
    const meterByCode = new Map(meters.map((meter) => [meter.code, meter]));

    for (const row of prepared) {
      const meter = meterByCode.get(row.meterCode);
      if (!meter) {
        errors.push(this.error(row.index, row.meterCode, 'METER_NOT_FOUND', 'Utility meter was not found in this society'));
        continue;
      }
      if (!meter.active) errors.push(this.error(row.index, row.meterCode, 'METER_INACTIVE', 'Inactive utility meters cannot accept readings'));
      row.meterId = meter.id;
    }

    for (const meter of meters) {
      const candidates = prepared.filter((row) => row.meterId === meter.id && Number.isFinite(row.readingAt.getTime()));
      if (candidates.length === 0) continue;
      const existing = await client.$queryRaw<Array<{ readingAt: Date; value: string; readingKind: UtilityReadingKind }>>(Prisma.sql`
        SELECT "readingAt","value"::text AS "value","readingKind"
        FROM "UtilityReading"
        WHERE "societyId"=${societyId}::uuid AND "meterId"=${meter.id}::uuid
        ORDER BY "readingAt" ASC
      `);
      const existingByTimestamp = new Set(existing.map((row) => row.readingAt.toISOString()));
      for (const row of candidates) {
        if (existingByTimestamp.has(row.readingAt.toISOString())) {
          errors.push(this.error(row.index, row.meterCode, 'TIMESTAMP_ALREADY_EXISTS', 'A reading already exists for this meter at that timestamp'));
        }
      }

      const sequence = [
        ...existing.map((row) => ({ readingAt: row.readingAt, value: Number(row.value), readingKind: row.readingKind, candidate: null as PreparedRow | null })),
        ...candidates.map((row) => ({ readingAt: row.readingAt, value: row.value, readingKind: row.readingKind, candidate: row })),
      ].sort((a, b) => a.readingAt.getTime() - b.readingAt.getTime());

      for (let index = 1; index < sequence.length; index += 1) {
        const previous = sequence[index - 1];
        const current = sequence[index];
        if (current.readingAt.getTime() === previous.readingAt.getTime()) continue;
        if (current.readingKind === 'ACTUAL' && current.value < previous.value && current.candidate) {
          errors.push(this.error(current.candidate.index, current.candidate.meterCode, 'READING_DECREASE', 'ACTUAL reading is lower than the previous reading; record a RESET at the reset/replacement point'));
        }
        if (current.readingKind !== 'RESET' && previous.candidate && previous.value > current.value) {
          errors.push(this.error(previous.candidate.index, previous.candidate.meterCode, 'READING_EXCEEDS_NEXT', 'Reading is higher than the next recorded reading'));
        }
      }
    }

    const uniqueErrors = [...new Map(errors.map((item) => [`${item.index}|${item.code}|${item.message}`, item])).values()]
      .sort((a, b) => a.index - b.index || a.code.localeCompare(b.code));
    return {
      valid: uniqueErrors.length === 0,
      rowCount: inputRows.length,
      errors: uniqueErrors,
      prepared,
    };
  }

  private error(index: number, meterCode: string, code: string, message: string): ValidationError {
    return { index, meterCode, code, message };
  }
}
