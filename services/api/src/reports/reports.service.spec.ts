import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

function prismaMock() {
  const tx = {
    accessRequest: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    maintenanceInvoice: {
      aggregate: vi.fn()
        .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { amountPaise: 10000 } })
        .mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { amountPaise: 5000 } })
        .mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { amountPaise: 5000 } }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    helpdeskTicket: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditEvent: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { ...tx, withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
}

describe('ReportsService', () => {
  it('compares adjacent equal-duration periods while preserving the finance redaction boundary', async () => {
    const prisma = prismaMock();
    prisma.maintenanceInvoice.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { amountPaise: 10000 } });
    const service = new ReportsService(prisma as unknown as PrismaService);
    const result = await service.summaryComparison(
      'society-1', '2026-09-10T00:00:00.000Z', '2026-09-12T00:00:00.000Z', false,
    );

    expect(result.current.range).toEqual({ from: '2026-09-10T00:00:00.000Z', to: '2026-09-12T00:00:00.000Z' });
    expect(result.previous.range).toEqual({ from: '2026-09-07T23:59:59.999Z', to: '2026-09-09T23:59:59.999Z' });
    expect(result.current.maintenance.billedPaise).toBeNull();
    expect(result.previous.maintenance.collectedPaise).toBeNull();
    for (const [query] of prisma.accessRequest.count.mock.calls) expect(query.where.societyId).toBe('society-1');
    for (const [query] of prisma.maintenanceInvoice.aggregate.mock.calls) expect(query.where.societyId).toBe('society-1');
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER, 1e100])('rejects overflowing pagination %s before database access', async (page) => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);
    await expect(service.auditFeed('society', page, 100)).rejects.toThrow();
    expect(prisma.auditEvent.count).not.toHaveBeenCalled();
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it('uses unique tie breakers when report timestamps match', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);
    await service.accessFeed('society', 'VISITOR');
    await service.helpdeskFeed('society');
    await service.maintenanceFeed('society');
    await service.auditFeed('society');
    for (const [model, timestamp] of [
      [prisma.accessRequest, 'createdAt'], [prisma.helpdeskTicket, 'createdAt'],
      [prisma.maintenanceInvoice, 'issuedAt'], [prisma.auditEvent, 'occurredAt'],
    ] as const) {
      expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: [{ [timestamp]: 'desc' }, { id: 'desc' }],
      }));
    }
  });

  it('keeps every summary query scoped to the authenticated society and redacts finance amounts by default', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);
    const societyId = '11111111-1111-1111-1111-111111111111';

    const result = await service.summary(societyId, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z');

    for (const [query] of prisma.accessRequest.count.mock.calls) expect(query.where.societyId).toBe(societyId);
    for (const [query] of prisma.maintenanceInvoice.aggregate.mock.calls) expect(query.where.societyId).toBe(societyId);
    for (const [query] of prisma.helpdeskTicket.count.mock.calls) expect(query.where.societyId).toBe(societyId);
    expect(prisma.auditEvent.count.mock.calls[0][0].where.societyId).toBe(societyId);
    expect(result.maintenance.billedCount).toBe(2);
    expect(result.maintenance.billedPaise).toBeNull();
    expect(result.maintenance.collectedPaise).toBeNull();
    expect(result.maintenance.outstandingPaise).toBeNull();
  });

  it('returns finance amounts only when the caller is explicitly finance-authorized', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);

    const result = await service.summary(
      'society-1',
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
      true,
    );

    expect(result.maintenance.billedPaise).toBe(10000);
    expect(result.maintenance.collectedPaise).toBe(5000);
    expect(result.maintenance.outstandingPaise).toBe(5000);
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

  it('returns a bounded privacy-safe access drilldown scoped to one society', async () => {
    const prisma = prismaMock();
    prisma.accessRequest.count.mockResolvedValue(1);
    prisma.accessRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        subjectType: 'VISITOR',
        subjectName: 'Guest',
        purpose: 'Visit',
        status: 'APPROVED',
        createdAt: new Date('2026-09-04T00:00:00.000Z'),
        enteredAt: null,
        exitedAt: null,
        unit: { number: '101', building: { name: 'A' } },
      },
    ]);
    const service = new ReportsService(prisma as unknown as PrismaService);

    const result = await service.accessFeed(
      'society-1',
      'VISITOR',
      '2026-09-01T00:00:00.000Z',
      '2026-09-05T00:00:00.000Z',
      2,
      25,
    );

    expect(prisma.accessRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ societyId: 'society-1', subjectType: 'VISITOR' }),
        skip: 25,
        take: 25,
        select: expect.not.objectContaining({ subjectPhone: true, credentialHash: true, metadata: true }),
      }),
    );
    expect(result.total).toBe(1);
  });

  it('rejects invalid access subject types before querying drilldown data', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);

    await expect(service.accessFeed('society-1', 'UNKNOWN')).rejects.toThrow(
      'subjectType must be a valid access subject type',
    );
    expect(prisma.accessRequest.findMany).not.toHaveBeenCalled();
  });

  it('keeps helpdesk drilldown society scoped and privacy limited', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);

    await service.helpdeskFeed('society-2', '2026-09-01T00:00:00.000Z', '2026-09-05T00:00:00.000Z', 1, 20);

    expect(prisma.helpdeskTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ societyId: 'society-2' }),
        take: 20,
        select: expect.not.objectContaining({ description: true, createdBy: true, assignedTo: true }),
      }),
    );
  });

  it('keeps maintenance drilldown society scoped without payment payloads', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);

    await service.maintenanceFeed('society-3', '2026-09-01T00:00:00.000Z', '2026-09-05T00:00:00.000Z', 1, 25);

    expect(prisma.maintenanceInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ societyId: 'society-3' }),
        take: 25,
        select: expect.not.objectContaining({ payments: true, createdBy: true }),
      }),
    );
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

  it('applies validated event and date filters to both audit feed queries', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);
    await service.auditFeed(
      'society-1', 1, 25, 'ACCESS_CHECKED_IN', '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z',
    );
    const where = { societyId: 'society-1', event: 'ACCESS_CHECKED_IN', occurredAt: expect.any(Object) };
    expect(prisma.auditEvent.count).toHaveBeenCalledWith({ where });
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));

    await expect(service.auditFeed('society-1', 1, 25, 'UNKNOWN')).rejects.toThrow(
      'event must be a valid audit event type',
    );
  });

  it('rejects excessive page sizes for all paginated feeds', async () => {
    const prisma = prismaMock();
    const service = new ReportsService(prisma as unknown as PrismaService);

    await expect(service.auditFeed('society-1', 1, 101)).rejects.toThrow('pageSize must be between 1 and 100');
    await expect(service.helpdeskFeed('society-1', undefined, undefined, 1, 101)).rejects.toThrow(
      'pageSize must be between 1 and 100',
    );
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.helpdeskTicket.findMany).not.toHaveBeenCalled();
  });

  it('keeps sequential society summaries independent while redacting unapproved finance amounts', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const prisma = prismaMock();
    const amountFor = (id: string) => id === a ? 1200 : 8900;
    prisma.accessRequest.count.mockImplementation(async ({ where }) => where.societyId === a ? 1 : 4);
    prisma.helpdeskTicket.count.mockImplementation(async ({ where }) => where.societyId === a ? 2 : 5);
    prisma.auditEvent.count.mockImplementation(async ({ where }) => where.societyId === a ? 3 : 6);
    prisma.maintenanceInvoice.aggregate.mockImplementation(async ({ where }) => ({
      _count: { _all: where.societyId === a ? 1 : 7 },
      _sum: { amountPaise: amountFor(where.societyId) },
    }));
    const service = new ReportsService(prisma as unknown as PrismaService);
    const aSummary = await service.summary(a, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z');
    const bSummary = await service.summary(b, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', true);
    expect(aSummary.access.visitorRequests).toBe(1);
    expect(bSummary.access.visitorRequests).toBe(4);
    expect(aSummary.helpdesk.open).toBe(2);
    expect(bSummary.helpdesk.open).toBe(5);
    expect(aSummary.audit.eventCount).toBe(3);
    expect(bSummary.audit.eventCount).toBe(6);
    expect(aSummary.maintenance.billedPaise).toBeNull();
    expect(aSummary.maintenance.outstandingPaise).toBeNull();
    expect(bSummary.maintenance.billedPaise).toBe(8900);
    expect(bSummary.maintenance.outstandingPaise).toBe(8900);
    for (const delegate of [prisma.accessRequest.count, prisma.helpdeskTicket.count, prisma.auditEvent.count, prisma.maintenanceInvoice.aggregate]) {
      const seen = delegate.mock.calls.map(([query]) => query.where.societyId);
      expect(seen).toContain(a);
      expect(seen).toContain(b);
      expect(seen.every(id => id === a || id === b)).toBe(true);
    }
  });

  it('never reuses a prior society predicate or page across the four report read feeds', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const prisma = prismaMock();
    for (const model of [prisma.accessRequest, prisma.helpdeskTicket, prisma.maintenanceInvoice, prisma.auditEvent]) {
      model.count.mockImplementation(async ({ where }) => where.societyId === a ? 1 : 2);
      model.findMany.mockImplementation(async ({ where }) => [{ id: where.societyId === a ? 'only-a' : 'only-b' }]);
    }
    const service = new ReportsService(prisma as unknown as PrismaService);
    const reads = [
      (id: string, page: number) => service.accessFeed(id, 'VISITOR', undefined, undefined, page, 10),
      (id: string, page: number) => service.helpdeskFeed(id, undefined, undefined, page, 10),
      (id: string, page: number) => service.maintenanceFeed(id, undefined, undefined, page, 10),
      (id: string, page: number) => service.auditFeed(id, page, 10),
    ];
    for (const read of reads) {
      const first = await read(a, 1);
      const second = await read(b, 2);
      expect(first.total).toBe(1);
      expect(second.total).toBe(2);
      expect(first.items[0].id).toBe('only-a');
      expect(second.items[0].id).toBe('only-b');
      expect(first.page).toBe(1);
      expect(second.page).toBe(2);
    }
    for (const model of [prisma.accessRequest, prisma.helpdeskTicket, prisma.maintenanceInvoice, prisma.auditEvent]) {
      const counts = model.count.mock.calls.map(([query]) => query.where.societyId);
      const pages = model.findMany.mock.calls.map(([query]) => query.where.societyId);
      expect(counts).toEqual([a, b]);
      expect(pages).toEqual([a, b]);
      expect(model.findMany.mock.calls.map(([query]) => query.skip)).toEqual([0, 10]);
      expect(model.findMany.mock.calls.map(([query]) => query.take)).toEqual([10, 10]);
    }
  });

  it('routes summary and all paginated Reports reads through the supplied tenant transaction, never root delegates', async () => {
    const selected = '11111111-1111-4111-8111-111111111111';
    const root = prismaMock();
    const scoped = prismaMock();
    root.withTenantContext.mockImplementation(async (_societyId, operation) => operation(scoped));
    const service = new ReportsService(root as unknown as PrismaService);

    await service.summary(selected, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z');
    await service.accessFeed(selected, 'VISITOR');
    await service.helpdeskFeed(selected);
    await service.maintenanceFeed(selected);
    await service.auditFeed(selected);
    expect(root.withTenantContext).toHaveBeenCalledTimes(5);
    for (const [societyId] of root.withTenantContext.mock.calls) expect(societyId).toBe(selected);

    for (const delegate of [root.accessRequest, root.maintenanceInvoice, root.helpdeskTicket, root.auditEvent]) {
      for (const fn of Object.values(delegate)) expect(fn).not.toHaveBeenCalled();
    }
    expect(scoped.accessRequest.count).toHaveBeenCalled();
    expect(scoped.accessRequest.findMany).toHaveBeenCalled();
    expect(scoped.maintenanceInvoice.aggregate).toHaveBeenCalled();
    expect(scoped.maintenanceInvoice.findMany).toHaveBeenCalled();
    expect(scoped.helpdeskTicket.findMany).toHaveBeenCalled();
    expect(scoped.auditEvent.findMany).toHaveBeenCalled();
    expect(scoped.maintenanceInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ societyId: selected, unit: { societyId: selected, building: { societyId: selected } } }),
    }));
  });

  it('keeps both adjacent summary periods in explicit selected-society transactions', async () => {
    const societyId = '33333333-3333-4333-8333-333333333333';
    const prisma = prismaMock();
    // Two comparison periods run three invoice aggregates each. A one-shot
    // three-value mock would silently return undefined for the second period.
    prisma.maintenanceInvoice.aggregate.mockResolvedValue({
      _count: { _all: 1 }, _sum: { amountPaise: 5000 },
    });
    const service = new ReportsService(prisma as unknown as PrismaService);
    await service.summaryComparison(societyId, '2026-09-11T00:00:00Z', '2026-09-12T00:00:00Z');
    expect(prisma.maintenanceInvoice.aggregate).toHaveBeenCalledTimes(6);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(2);
    expect(prisma.withTenantContext.mock.calls.map(([id]) => id)).toEqual([societyId, societyId]);
  });

});
