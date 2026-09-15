import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_EXPORT_CONTRACT_V1, AccountingExportService, accountingExportRequestHash, renderAccountingExport } from './accounting-export.service';

const input={idempotencyKey:'export-1',contractVersion:ACCOUNTING_EXPORT_CONTRACT_V1,format:'CSV' as const,fromDate:'2026-04-01',toDate:'2027-03-31'};
const exportRow={entryId:'entry-1',entryNumber:'J-1',entryDate:'2026-04-02',journalStatus:'POSTED',journalDescription:'=danger',sourceType:'TEST',sourceId:'source-1',externalReference:null,lineId:'line-1',accountCode:'1000',accountName:'Cash',accountType:'ASSET',fundCode:null,unitId:null,lineDescription:'line',debitPaise:'100',creditPaise:'0',currency:'INR'};

describe('AccountingExportService',()=>{
  it('creates a tenant-scoped queued job and audits the request',async()=>{
    const row={id:'job-1',requestHash:accountingExportRequestHash(input),status:'QUEUED'};
    const query=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    const auditCreate=vi.fn().mockResolvedValue({});
    const tx={$executeRaw:vi.fn(),$queryRaw:query,auditEvent:{create:auditCreate}};
    const prisma={$transaction:vi.fn((callback)=>(callback as (value:typeof tx)=>unknown)(tx))} as unknown as PrismaService;
    const result=await new AccountingExportService(prisma).create('society-1','user-1',input);
    expect(result).toBe(row);
    expect(auditCreate).toHaveBeenCalledWith({data:{societyId:'society-1',actorUserId:'user-1',event:AuditEventType.ACCOUNTING_EXPORT_REQUESTED}});
  });

  it('rejects reuse of an idempotency key for a different request',async()=>{
    const existing={id:'job-1',requestHash:'different'};
    const tx={$executeRaw:vi.fn(),$queryRaw:vi.fn().mockResolvedValue([existing]),auditEvent:{create:vi.fn()}};
    const prisma={$transaction:vi.fn((callback)=>(callback as (value:typeof tx)=>unknown)(tx))} as unknown as PrismaService;
    await expect(new AccountingExportService(prisma).create('society-1','user-1',input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('renders deterministic CSV and protects spreadsheet-formula cells',()=>{
    const artifact=renderAccountingExport({id:'12345678-0000-0000-0000-000000000000',format:'CSV',fromDate:new Date('2026-04-01T00:00:00Z'),toDate:new Date('2026-04-30T00:00:00Z')},[exportRow]);
    expect(artifact.filename).toBe('aaraagate-accounting-2026-04-01_to_2026-04-30-12345678.csv');
    expect(artifact.content).toContain('"\'=danger"');
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.byteLength).toBe(Buffer.byteLength(artifact.content,'utf8'));
  });

  it('renders one JSON object per line without bigint serialization risk',()=>{
    const artifact=renderAccountingExport({id:'12345678-0000-0000-0000-000000000000',format:'JSONL',fromDate:new Date('2026-04-01T00:00:00Z'),toDate:new Date('2026-04-30T00:00:00Z')},[exportRow]);
    expect(artifact.content.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(artifact.content).debitPaise).toBe('100');
  });
});
