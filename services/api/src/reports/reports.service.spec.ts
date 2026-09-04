import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

function prismaMock() {
  return {
    accessRequest: { count: vi.fn().mockResolvedValue(0) },
    maintenanceInvoice: {
      aggregate: vi.fn()
        .mockResolvedValueOnce({ _count: { _all: 0 }, _sum: { amountPaise: null } })
        .mockResolvedValueOnce({ _count: { _all: 0 }, _sum: { amountPaise: null } })
        .mockResolvedValueOnce({ _count: { _all: 0 }, _sum: { amountPaise: null } }),
    },
    helpdeskTicket: { count: vi.fn().mockResolvedValue(0) },
    auditEvent: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('ReportsService', () => {
  it('keeps every summary query scoped to the authenticated society', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);
    const societyId = '11111111-1111-1111-1111-111111111111';

    const result = await service.summary(societyId, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z');

    for (const [query] of prisma.accessRequest.count.mock.calls) expect(query.where.societyId).toBe(societyId);
    for (const [query] of prisma.maintenanceInvoice.aggregate.mock.calls) expect(query.where.societyId).toBe(societyId);
    for (const [query] of prisma.helpdeskTicket.count.mock.calls) expect(query.where.societyId).toBe(societyId);
    expect(prisma.auditEvent.count.mock.calls[0][0].where.societyId).toBe(societyId);
    expect(result.maintenance.outstandingPaise).toBe(0);
  });

  it('rejects unbounded or reversed report windows before querying data', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);

    await expect(service.summary('society', '2026-09-02T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).rejects.toThrow(
      'from must be before to',
    );
    await expect(service.summary('society', '2025-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).rejects.toThrow(
      'Report range cannot exceed 366 days',
    );
    expect(prisma.accessRequest.count).not.toHaveBeenCalled();
  });

  it('returns a bounded privacy-safe audit feed scoped to one society', async () => {
    const prisma = prismaMock();
    prisma.auditEvent.count.mockResolvedValue(1);
    prisma.auditEvent.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        event: 'ACCESS_CHECKED_IN',
        occurredAt: new Date('2026-09-04T00:00:00.000Z'),
        actorUserId: 'actor-1',
        gateId: 'gate-1',
        accessRequestId: 'request-1',
        visitorPassId: null,
      },
    ]);
    const service = new ReportsService(prisma as unknown as PrismaService);

    const result = await service.auditFeed('society-1', 2, 25);

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { societyId: 'society-1' },
        skip: 25,
        take: 25,
        select: expect.not.objectContaining({ accessRequest: true, visitorPass: true }),
      }),
    );
    expect(result.total).toBe(1);
  });

  it('rejects excessive audit page sizes', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);
    await expect(service.auditFeed('society-1', 1, 101)).rejects.toThrow('pageSize must be between 1 and 100');
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });
});
