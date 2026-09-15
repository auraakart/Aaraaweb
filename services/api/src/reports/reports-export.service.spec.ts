import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsExportService } from './reports-export.service';

describe('ReportsExportService', () => {
  it('exports a bounded, tenant-scoped audit feed and records the export', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      event: 'ACCESS_CHECKED_IN', occurredAt: new Date('2026-09-15T00:00:00.000Z'),
      actorUserId: 'actor', gateId: null, accessRequestId: 'request', visitorPassId: null,
    }]);
    const auditCreate = vi.fn().mockResolvedValue({});
    const service = new ReportsExportService({ auditEvent: { findMany, create: auditCreate } } as unknown as PrismaService);
    const result = await service.auditCsv('society', 'actor', '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society', occurredAt: expect.any(Object) }, take: 5001,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    }));
    expect(result.csv).toContain('ACCESS_CHECKED_IN,2026-09-15T00:00:00.000Z,actor,,request,');
    expect(auditCreate).toHaveBeenCalled();
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
    const result = await new ReportsExportService(prisma as unknown as PrismaService)
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
    const service = new ReportsExportService(prisma);

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
    const service = new ReportsExportService(prisma);

    await expect(service.maintenanceCsv(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
