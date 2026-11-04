import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsExportService } from './reports-export.service';

/** Tests cannot silently fall back to a root Prisma delegate. */
function tenantPrisma<T extends object>(tx:T):PrismaService{
  return {withTenantContext:vi.fn(async (_societyId:string,op:(client:T)=>Promise<unknown>)=>op(tx))} as unknown as PrismaService;
}


describe('ReportsExportService', () => {
  it('exports a bounded, tenant-scoped audit feed and records the export', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      event: 'ACCESS_CHECKED_IN', occurredAt: new Date('2026-09-15T00:00:00.000Z'),
      actorUserId: 'actor', gateId: null, accessRequestId: 'request', visitorPassId: null,
    }]);
    const auditCreate = vi.fn().mockResolvedValue({});
    const service = new ReportsExportService(tenantPrisma({ auditEvent: { findMany, create: auditCreate } }));
    const result = await service.auditCsv(
      'society', 'actor', '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z', 'ACCESS_CHECKED_IN',
    );
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society', occurredAt: expect.any(Object), event: 'ACCESS_CHECKED_IN' }, take: 5001,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    }));
    expect(result.csv).toContain('ACCESS_CHECKED_IN,2026-09-15T00:00:00.000Z,actor,,request,');
    expect(auditCreate).toHaveBeenCalled();
  });

  it('rejects unknown audit-event filters before querying data', async () => {
    const findMany = vi.fn();
    const service = new ReportsExportService(tenantPrisma({ auditEvent: { findMany } }));
    await expect(service.auditCsv('society', 'actor', undefined, undefined, 'UNKNOWN')).rejects.toThrow(
      'event must be a valid audit event type',
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each(['\t=2+2', '\r=2+2', '\n=2+2', '  =2+2', '＝2+2', '＋2', '－2', '＠SUM(A1)'])('neutralizes unsafe spreadsheet prefix %j', async (invoiceNumber) => {
    const prisma = {
      maintenanceInvoice: { findMany: vi.fn().mockResolvedValue([{
        invoiceNumber, billingPeriod: '2026-09', amountPaise: 100,
        dueDate: new Date('2026-09-30Z'), status: 'ISSUED',
        issuedAt: new Date('2026-09-15Z'), paidAt: null,
        unit: { number: '101', building: { name: 'Tower "A", east' } },
      }]) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const result = await new ReportsExportService(tenantPrisma(prisma))
      .maintenanceCsv('society', 'actor');
    const escaped = `'${invoiceNumber}`;
    const expectedCell = /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
    expect(result.csv).toContain(`\n${expectedCell},2026-09,`);
    expect(result.csv).toContain('"Tower ""A"", east",101,100,');
  });

  it('scopes finance exports to the authenticated society, neutralizes spreadsheet formulas, and audits the export', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        invoiceNumber: '=2+2',
        billingPeriod: '2026-09',
        amountPaise: 12345,
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        status: 'ISSUED',
        issuedAt: new Date('2026-09-15T00:00:00.000Z'),
        paidAt: null,
        unit: { number: '@A-101', building: { name: '+Tower A' } },
      },
    ]);
    const auditCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      maintenanceInvoice: { findMany },
      auditEvent: { create: auditCreate },
    } as unknown as PrismaService;
    const service = new ReportsExportService(tenantPrisma(prisma));

    const result = await service.maintenanceCsv(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '2026-09-01T00:00:00.000Z',
      '2026-09-30T00:00:00.000Z',
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ societyId: '11111111-1111-1111-1111-111111111111' }),
      take: 5001,
    }));
    expect(result.csv).toContain("'=2+2");
    expect(result.csv).toContain("'+Tower A");
    expect(result.csv).toContain("'@A-101");
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        societyId: '11111111-1111-1111-1111-111111111111',
        actorUserId: '22222222-2222-2222-2222-222222222222',
        event: 'REPORT_EXPORTED',
      },
    });
  });

  it('fails closed when the export would exceed the bounded row limit and does not audit a failed export', async () => {
    const row = {
      invoiceNumber: 'INV',
      billingPeriod: '2026-09',
      amountPaise: 100,
      dueDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'ISSUED',
      issuedAt: new Date('2026-09-15T00:00:00.000Z'),
      paidAt: null,
      unit: { number: 'A-101', building: { name: 'Tower A' } },
    };
    const auditCreate = vi.fn();
    const prisma = {
      maintenanceInvoice: { findMany: vi.fn().mockResolvedValue(Array.from({ length: 5001 }, () => row)) },
      auditEvent: { create: auditCreate },
    } as unknown as PrismaService;
    const service = new ReportsExportService(tenantPrisma(prisma));

    await expect(service.maintenanceCsv(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects oversized audit CSV before writing a misleading export audit event', async () => {
    const auditRows = Array.from({ length: 5001 }, () => ({
      event: 'ACCESS_CREATED',
      occurredAt: new Date('2026-09-15T00:00:00.000Z'),
      actorUserId: 'actor', gateId: null, accessRequestId: null, visitorPassId: null,
    }));
    const findMany = vi.fn().mockResolvedValue(auditRows);
    const create = vi.fn();
    const service = new ReportsExportService(tenantPrisma({
      auditEvent: { findMany, create },
    }));

    await expect(service.auditCsv(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '2026-09-01T00:00:00Z',
      '2026-09-30T00:00:00Z',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 5001,
      where: expect.objectContaining({ societyId: '11111111-1111-4111-8111-111111111111' }),
    }));
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the selected society for each audit export and the resulting audit evidence', async () => {
    const societyA = '11111111-1111-4111-8111-111111111111';
    const societyB = '33333333-3333-4333-8333-333333333333';
    const actor = '22222222-2222-4222-8222-222222222222';
    const findMany = vi.fn().mockImplementation(async (query: { where: { societyId: string } }) => {
      const marker = query.where.societyId === societyA ? 'gate-a' : 'gate-b';
      return [{
        event: 'VISITOR_CHECKED_IN', occurredAt: new Date('2026-09-10T00:00:00.000Z'),
        actorUserId: actor, gateId: marker, accessRequestId: null, visitorPassId: null,
      }];
    });
    const create = vi.fn().mockResolvedValue({});
    const service = new ReportsExportService(tenantPrisma({
      auditEvent: { findMany, create },
    }));

    const a = await service.auditCsv(societyA, actor);
    const b = await service.auditCsv(societyB, actor);
    expect(a.csv).toContain('gate-a');
    expect(a.csv).not.toContain('gate-b');
    expect(b.csv).toContain('gate-b');
    expect(b.csv).not.toContain('gate-a');
    expect(findMany.mock.calls.map(([query]) => query.where.societyId)).toEqual([societyA, societyB]);
    expect(create.mock.calls.map(([query]) => query.data)).toEqual([
      { societyId: societyA, actorUserId: actor, event: 'REPORT_EXPORTED' },
      { societyId: societyB, actorUserId: actor, event: 'REPORT_EXPORTED' },
    ]);
  });

  it('rejects malformed export date ranges before reading or writing tenant data', async () => {
    const invoiceFindMany = vi.fn();
    const auditFindMany = vi.fn();
    const auditCreate = vi.fn();
    const service = new ReportsExportService(tenantPrisma({
      maintenanceInvoice: { findMany: invoiceFindMany },
      auditEvent: { findMany: auditFindMany, create: auditCreate },
    }));
    await expect(service.maintenanceCsv('society', 'actor', 'invalid-date')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.auditCsv('society', 'actor', '2026-11-01', '2026-01-01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.auditCsv('society', 'actor', '2025-01-01', '2026-11-01')).rejects.toBeInstanceOf(BadRequestException);
    expect(invoiceFindMany).not.toHaveBeenCalled();
    expect(auditFindMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('restricts audit export projection to the approved privacy-safe columns', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReportsExportService(tenantPrisma({
      auditEvent: { findMany, create: vi.fn().mockResolvedValue({}) },
    }));
    const result = await service.auditCsv('11111111-1111-4111-8111-111111111111', 'actor');
    const query = findMany.mock.calls[0][0];
    expect(query.select).toEqual({
      event: true, occurredAt: true, actorUserId: true,
      gateId: true, accessRequestId: true, visitorPassId: true,
    });
    expect(query.where.societyId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.csv).toBe('event,occurredAt,actorUserId,gateId,accessRequestId,visitorPassId\n');
    expect(result.rowCount).toBe(0);
  });


  it('reads maintenance and writes export evidence inside the selected transaction only',async()=>{
    const societyId='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
    const rootRead=vi.fn(),rootWrite=vi.fn(),txRead=vi.fn().mockResolvedValue([]),txWrite=vi.fn().mockResolvedValue({});
    const withTenantContext=vi.fn(async(_id:string,op:(tx:unknown)=>Promise<unknown>)=>op({maintenanceInvoice:{findMany:txRead},auditEvent:{create:txWrite}}));
    const service=new ReportsExportService({withTenantContext,maintenanceInvoice:{findMany:rootRead},auditEvent:{create:rootWrite}} as unknown as PrismaService);
    const result=await service.maintenanceCsv(societyId,actor);
    expect(result.rowCount).toBe(0);
    expect(withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(txRead).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({societyId,unit:{societyId,building:{societyId}}})}));
    expect(txWrite).toHaveBeenCalledWith({data:{societyId,actorUserId:actor,event:'REPORT_EXPORTED'}});
    expect(rootRead).not.toHaveBeenCalled();expect(rootWrite).not.toHaveBeenCalled();
  });

  it('reads audit CSV and writes its evidence on one tenant transaction, without root access',async()=>{
    const societyId='33333333-3333-4333-8333-333333333333',actor='22222222-2222-4222-8222-222222222222';
    const rootRead=vi.fn(),rootWrite=vi.fn(),txRead=vi.fn().mockResolvedValue([]),txWrite=vi.fn().mockResolvedValue({});
    const withTenantContext=vi.fn(async(_id:string,op:(tx:unknown)=>Promise<unknown>)=>op({auditEvent:{findMany:txRead,create:txWrite}}));
    const service=new ReportsExportService({withTenantContext,auditEvent:{findMany:rootRead,create:rootWrite}} as unknown as PrismaService);
    const result=await service.auditCsv(societyId,actor);
    expect(result.rowCount).toBe(0);
    expect(withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(txRead).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({societyId})}));
    expect(txWrite).toHaveBeenCalledWith({data:{societyId,actorUserId:actor,event:'REPORT_EXPORTED'}});
    expect(rootRead).not.toHaveBeenCalled();expect(rootWrite).not.toHaveBeenCalled();
  });

});
