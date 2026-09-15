import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_EXPORT_CONTRACT_V1, AccountingExportService, accountingExportRequestHash } from './accounting-export.service';

const input={idempotencyKey:'export-1',contractVersion:ACCOUNTING_EXPORT_CONTRACT_V1,format:'CSV' as const,fromDate:'2026-04-01',toDate:'2027-03-31'};

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
});
