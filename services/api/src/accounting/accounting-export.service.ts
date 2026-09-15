import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ACCOUNTING_EXPORT_CONTRACT_V1 = 'aaraagate.accounting.journal.v1';
type ExportInput = { idempotencyKey: string; contractVersion: string; format: 'CSV' | 'JSONL'; fromDate: string; toDate: string };
type ExportJob = { id: string; requestHash: string; contractVersion: string; format: string; fromDate: Date; toDate: Date; status: string; recordCount: number | null; artifactKey: string | null; errorCode: string | null; createdAt: Date; completedAt: Date | null };

export function accountingExportRequestHash(input: ExportInput) {
  return createHash('sha256').update(JSON.stringify({ contractVersion: input.contractVersion, format: input.format, fromDate: input.fromDate, toDate: input.toDate })).digest('hex');
}

@Injectable()
export class AccountingExportService {
  constructor(private readonly prisma: PrismaService) {}

  async create(societyId: string, userId: string, input: ExportInput) {
    const from = new Date(`${input.fromDate}T00:00:00.000Z`);
    const to = new Date(`${input.toDate}T00:00:00.000Z`);
    if (from > to) throw new BadRequestException('Export start must be on or before end');
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new BadRequestException('Accounting export range cannot exceed 366 days');
    const requestHash = accountingExportRequestHash(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${input.idempotencyKey}`}))`);
      const existing = await tx.$queryRaw<ExportJob[]>(Prisma.sql`SELECT * FROM "AccountingExportJob" WHERE "societyId"=${societyId}::uuid AND "idempotencyKey"=${input.idempotencyKey} LIMIT 1`);
      if (existing.length) {
        if (existing[0].requestHash !== requestHash) throw new ConflictException('Idempotency key was already used for a different export request');
        return existing[0];
      }
      const rows = await tx.$queryRaw<ExportJob[]>(Prisma.sql`
        INSERT INTO "AccountingExportJob" ("societyId","requestedByUserId","idempotencyKey","requestHash","contractVersion","format","fromDate","toDate")
        VALUES (${societyId}::uuid,${userId}::uuid,${input.idempotencyKey},${requestHash},${input.contractVersion},${input.format},${input.fromDate}::date,${input.toDate}::date)
        RETURNING *
      `);
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, event: AuditEventType.ACCOUNTING_EXPORT_REQUESTED } });
      return rows[0];
    });
  }

  list(societyId: string) {
    return this.prisma.$queryRaw<ExportJob[]>(Prisma.sql`SELECT * FROM "AccountingExportJob" WHERE "societyId"=${societyId}::uuid ORDER BY "createdAt" DESC LIMIT 100`);
  }

  async get(societyId: string, id: string) {
    const rows = await this.prisma.$queryRaw<ExportJob[]>(Prisma.sql`SELECT * FROM "AccountingExportJob" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid LIMIT 1`);
    if (!rows.length) throw new NotFoundException('Accounting export job not found');
    return rows[0];
  }
}
