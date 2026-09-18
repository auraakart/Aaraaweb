import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ACCOUNTING_EXPORT_CONTRACT_V1 = 'aaraagate.accounting.journal.v1';
export const ACCOUNTING_EXPORT_MAX_ROWS = 50_000;
export const ACCOUNTING_EXPORT_MAX_BYTES = 8 * 1024 * 1024;
type ExportInput = { idempotencyKey: string; contractVersion: string; format: 'CSV' | 'JSONL'; fromDate: string; toDate: string };
export type ExportJob = { id: string; societyId?: string; requestedByUserId?: string; requestHash: string; contractVersion: string; format: 'CSV' | 'JSONL'; fromDate: Date; toDate: Date; status: string; recordCount: number | null; artifactKey: string | null; errorCode: string | null; createdAt: Date; completedAt: Date | null };
type ExportRow = { entryId:string; entryNumber:string; entryDate:Date|string; journalStatus:string; journalDescription:string; sourceType:string|null; sourceId:string|null; externalReference:string|null; lineId:string; accountCode:string; accountName:string; accountType:string; fundCode:string|null; unitId:string|null; lineDescription:string|null; debitPaise:string; creditPaise:string; currency:string };
export type ExportArtifact={filename:string;contentType:string;sha256:string;byteLength:number;content:string};

export function accountingExportRequestHash(input: ExportInput) {
  return createHash('sha256').update(JSON.stringify({ contractVersion: input.contractVersion, format: input.format, fromDate: input.fromDate, toDate: input.toDate })).digest('hex');
}

function csvCell(value:unknown){const text=value===null||value===undefined?'':String(value);const protectedText=/^[\u0000-\u0020]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u.test(text)?`'${text}`:text;return `"${protectedText.replaceAll('"','""')}"`;}
function dateOnly(value:Date|string){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}
function normalizedRow(row:ExportRow){return {contractVersion:ACCOUNTING_EXPORT_CONTRACT_V1,entryId:row.entryId,entryNumber:row.entryNumber,entryDate:dateOnly(row.entryDate),journalStatus:row.journalStatus,journalDescription:row.journalDescription,sourceType:row.sourceType,sourceId:row.sourceId,externalReference:row.externalReference,lineId:row.lineId,accountCode:row.accountCode,accountName:row.accountName,accountType:row.accountType,fundCode:row.fundCode,unitId:row.unitId,lineDescription:row.lineDescription,debitPaise:row.debitPaise,creditPaise:row.creditPaise,currency:row.currency};}

export function renderAccountingExport(job:Pick<ExportJob,'id'|'format'|'fromDate'|'toDate'>,rows:ExportRow[]):ExportArtifact{
  const normalized=rows.map(normalizedRow);
  const datePart=`${dateOnly(job.fromDate)}_to_${dateOnly(job.toDate)}`;
  let content:string,contentType:string,extension:string;
  if(job.format==='JSONL'){
    content=normalized.map(row=>JSON.stringify(row)).join('\n')+(normalized.length?'\n':'');contentType='application/x-ndjson; charset=utf-8';extension='jsonl';
  }else{
    const headers=['contractVersion','entryId','entryNumber','entryDate','journalStatus','journalDescription','sourceType','sourceId','externalReference','lineId','accountCode','accountName','accountType','fundCode','unitId','lineDescription','debitPaise','creditPaise','currency'] as const;
    content=[headers.join(','),...normalized.map(row=>headers.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';contentType='text/csv; charset=utf-8';extension='csv';
  }
  const byteLength=Buffer.byteLength(content,'utf8');
  if(byteLength>ACCOUNTING_EXPORT_MAX_BYTES)throw new Error('EXPORT_ARTIFACT_TOO_LARGE');
  return {filename:`aaraagate-accounting-${datePart}-${job.id.slice(0,8)}.${extension}`,contentType,sha256:createHash('sha256').update(content).digest('hex'),byteLength,content};
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

  async executeClaimed(job:ExportJob&{societyId:string}){
    try{
      const rows=await this.prisma.$queryRaw<ExportRow[]>(Prisma.sql`
        SELECT je."id"::text AS "entryId",je."entryNumber",je."entryDate",je."status"::text AS "journalStatus",je."description" AS "journalDescription",
               je."sourceType",je."sourceId",je."externalReference",jl."id"::text AS "lineId",la."code" AS "accountCode",la."name" AS "accountName",la."type"::text AS "accountType",
               af."code" AS "fundCode",jl."unitId"::text AS "unitId",jl."description" AS "lineDescription",jl."debitPaise"::text AS "debitPaise",jl."creditPaise"::text AS "creditPaise",je."currency"
        FROM "JournalEntry" je
        JOIN "JournalLine" jl ON jl."entryId"=je."id" AND jl."societyId"=je."societyId"
        JOIN "LedgerAccount" la ON la."id"=jl."accountId" AND la."societyId"=je."societyId"
        LEFT JOIN "AccountingFund" af ON af."id"=jl."fundId" AND af."societyId"=je."societyId"
        WHERE je."societyId"=${job.societyId}::uuid AND je."status" IN ('POSTED','REVERSED')
          AND je."entryDate">=${dateOnly(job.fromDate)}::date AND je."entryDate"<=${dateOnly(job.toDate)}::date
        ORDER BY je."entryDate",je."entryNumber",jl."id"
        LIMIT ${ACCOUNTING_EXPORT_MAX_ROWS+1}
      `);
      if(rows.length>ACCOUNTING_EXPORT_MAX_ROWS)throw new Error('EXPORT_ROW_LIMIT_EXCEEDED');
      const artifact=renderAccountingExport(job,rows);
      await this.prisma.$transaction(async tx=>{
        const inserted=await tx.$queryRaw<{id:string}[]>(Prisma.sql`
          INSERT INTO "AccountingExportArtifact" ("societyId","jobId","filename","contentType","sha256","byteLength","content")
          VALUES (${job.societyId}::uuid,${job.id}::uuid,${artifact.filename},${artifact.contentType},${artifact.sha256},${artifact.byteLength},${artifact.content})
          ON CONFLICT ("jobId") DO NOTHING RETURNING "id"
        `);
        const artifactId=inserted[0]?.id??(await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT "id" FROM "AccountingExportArtifact" WHERE "societyId"=${job.societyId}::uuid AND "jobId"=${job.id}::uuid LIMIT 1`))[0]?.id;
        if(!artifactId)throw new Error('EXPORT_ARTIFACT_PERSIST_FAILED');
        await tx.$executeRaw(Prisma.sql`UPDATE "AccountingExportJob" SET "status"='COMPLETED',"recordCount"=${rows.length},"artifactKey"=${artifactId},"errorCode"=NULL,"completedAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL WHERE "id"=${job.id}::uuid AND "societyId"=${job.societyId}::uuid AND "status"='PROCESSING'`);
      });
    }catch(error){
      const code=this.errorCode(error);
      await this.prisma.$executeRaw(Prisma.sql`UPDATE "AccountingExportJob" SET "status"='FAILED',"errorCode"=${code},"completedAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL WHERE "id"=${job.id}::uuid AND "societyId"=${job.societyId}::uuid AND "status"='PROCESSING'`);
    }
  }

  async artifact(societyId:string,id:string){
    const rows=await this.prisma.$queryRaw<ExportArtifact[]>(Prisma.sql`
      SELECT a."filename",a."contentType",a."sha256",a."byteLength",a."content"
      FROM "AccountingExportArtifact" a JOIN "AccountingExportJob" j ON j."id"=a."jobId" AND j."societyId"=a."societyId"
      WHERE a."societyId"=${societyId}::uuid AND j."id"=${id}::uuid AND j."status"='COMPLETED' LIMIT 1
    `);
    if(!rows.length)throw new NotFoundException('Completed accounting export artifact not found');
    return rows[0];
  }

  private errorCode(error:unknown){const value=error instanceof Error?error.message:String(error);return /^[A-Z0-9_]{1,80}$/.test(value)?value:'EXPORT_GENERATION_FAILED';}
}
