import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsAnalyticsService } from './reports-analytics.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('Journey query windows on migrated PostgreSQL', () => {
  const prisma = new PrismaService();
  const societies = [randomUUID(), randomUUID()];
  const userId = randomUUID();
  const providerId = randomUUID();
  const categoryId = randomUUID();
  const offeringId = randomUUID();
  const from = new Date('2026-09-01T00:00:00Z');
  const to = new Date('2026-09-30T00:00:00Z');
  const historical = new Date('2020-01-01T00:00:00Z');
  const analytics = new ReportsAnalyticsService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, phone: `journey-${userId}` } });
    await prisma.serviceProvider.create({ data: { id: providerId, businessName: 'Fixture', phone: `journey-${providerId}` } });
    await prisma.serviceCategory.create({ data: { id: categoryId, name: 'Fixture', slug: `journey-${categoryId}` } });
    await prisma.serviceOffering.create({ data: { id: offeringId, providerId, categoryId, name: 'Fixture', pricePaise: 1000 } });
    for (const societyId of societies) {
      await prisma.society.create({ data: { id: societyId, name: 'Journey fixture', code: `journey-${societyId}` } });
      const building = await prisma.building.create({ data: { societyId, name: 'Fixture', code: 'T' } });
      const unit = await prisma.unit.create({ data: { societyId, buildingId: building.id, number: '1' } });
      const invoice = await prisma.maintenanceInvoice.create({ data: {
        societyId, unitId: unit.id, createdById: userId, invoiceNumber: 'fixture',
        billingPeriod: '2026-09', amountPaise: 1000, dueDate: to,
      } });
      const access = { societyId, unitId: unit.id, requestedById: userId, subjectType: 'VISITOR' as const, subjectName: 'Fixture' };
      await prisma.accessRequest.createMany({ data: [
        ...Array.from({ length: 100 }, () => ({ ...access, createdAt: historical })),
        { ...access, createdAt: historical, enteredAt: from, exitedAt: to, status: 'CHECKED_OUT' },
        { ...access, createdAt: from, status: 'APPROVED' },
      ] });
      const ticket = { societyId, unitId: unit.id, createdById: userId, title: 'Fixture', description: 'Fixture' };
      await prisma.helpdeskTicket.createMany({ data: [
        ...Array.from({ length: 100 }, () => ({ ...ticket, createdAt: historical })),
        { ...ticket, createdAt: historical, resolvedAt: from, closedAt: to, status: 'CLOSED' },
        { ...ticket, createdAt: from },
      ] });
      const booking = { societyId, unitId: unit.id, residentUserId: userId, providerId, offeringId,
        scheduledFrom: from, scheduledUntil: to, servicePricePaise: 1000, commissionBps: 1000, commissionPaise: 100 };
      await prisma.serviceBooking.createMany({ data: [
        ...Array.from({ length: 100 }, () => ({ ...booking, createdAt: historical })),
        { ...booking, createdAt: from, status: 'COMPLETED' },
        { ...booking, createdAt: to, status: 'CONFIRMED' },
      ] });
      const payment = () => ({ societyId, invoiceId: invoice.id, payerUserId: userId,
        provider: 'TEST', providerOrderId: `journey-${randomUUID()}`, idempotencyKey: randomUUID(), amountPaise: 1000 });
      await prisma.payment.createMany({ data: [
        ...Array.from({ length: 100 }, () => ({ ...payment(), createdAt: historical, status: 'FAILED' as const })),
        { ...payment(), createdAt: historical, completedAt: to, status: 'CAPTURED' },
        { ...payment(), createdAt: from, status: 'FAILED' },
      ] });
    }
  }, 20_000);

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      await prisma.payment.deleteMany({ where: { societyId: { in: societies } } });
      await prisma.maintenanceInvoice.deleteMany({ where: { societyId: { in: societies } } });
      await prisma.society.deleteMany({ where: { id: { in: societies } } });
      await prisma.serviceProvider.delete({ where: { id: providerId } });
      await prisma.serviceCategory.delete({ where: { id: categoryId } });
      await prisma.user.delete({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('retains historical records with in-window milestones, inclusive boundaries and society isolation', async () => {
    const result = await analytics.journeyFunnel(societies[0], from.toISOString(), to.toISOString());
    expect(result).toEqual({
      range: { from: from.toISOString(), to: to.toISOString() },
      visitor: { requested: 1, approved: 1, entered: 1, exited: 1 },
      helpdesk: { created: 1, resolved: 1, closed: 1 },
      services: { requested: 2, confirmed: 2, inprogress: 1, inProgress: 1, completed: 1 },
      payments: { created: 1, captured: 1, failed: 1 },
      source: 'authoritative-domain-records',
    });
  });

  it('preserves all original aggregates while reducing rows entering each aggregate', async () => {
    const observed = vi.spyOn(prisma, '$queryRaw');
    await analytics.journeyFunnel(societies[0], from.toISOString(), to.toISOString());
    const queries = observed.mock.calls.map(call => call[0] as Prisma.Sql);
    const results = await Promise.all(observed.mock.results.map(result => result.value));
    observed.mockRestore();
    for (const [index, query] of queries.entries()) {
      // Remove only the appended window predicate from trusted repository SQL
      // to reproduce the previous query. Retain all FILTERs and tenant clauses.
      const cutoff = query.text.indexOf('\n          AND (');
      expect(cutoff).toBeGreaterThan(0);
      const original = query.text.slice(0, cutoff);
      const parameterCount = Math.max(...Array.from(original.matchAll(/\$(\d+)/g), match => Number(match[1])));
      const parameters = query.values.slice(0, parameterCount);
      await expect(prisma.$queryRawUnsafe(original, ...parameters)).resolves.toEqual(results[index]);
      const inputRows = async (sql: string, values: unknown[]) => {
        const explain = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': Array<{ Plan: { Plans: Array<Record<string, unknown>> } }> }>>(
          `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, ...values,
        );
        return Number(explain[0]['QUERY PLAN'][0].Plan.Plans[0]['Actual Rows']);
      };
      const before = await inputRows(original, parameters);
      const after = await inputRows(query.text, query.values);
      expect(before).toBe(102);
      expect(after).toBe(2);
      console.info(`Journey aggregate ${index}: input rows ${before}->${after} (fixture; not production latency or index-I/O evidence)`);
    }
  });

  it('returns zero aggregates for a society with no records', async () => {
    const result = await analytics.journeyFunnel(randomUUID(), from.toISOString(), to.toISOString());
    expect(result.visitor).toEqual({ requested: 0, approved: 0, entered: 0, exited: 0 });
    expect(result.helpdesk).toEqual({ created: 0, resolved: 0, closed: 0 });
    expect(result.services).toEqual({ requested: 0, confirmed: 0, inprogress: 0, inProgress: 0, completed: 0 });
    expect(result.payments).toEqual({ created: 0, captured: 0, failed: 0 });
  });

  it('exposes canonical operations metrics without removing the legacy lowercase fields', async () => {
    const result = await analytics.operationsDashboard(societies[0], from.toISOString(), to.toISOString());
    expect(result.helpdesk).toEqual({
      open: 101, responsebreached: 0, resolutionbreached: 0, resolvedinrange: 1,
      responseBreached: 0, resolutionBreached: 0, resolvedInRange: 1,
    });
    expect(result.facilities).toEqual({
      open: 0, inprogress: 0, completedinrange: 0, overdue: 0, criticalopen: 0,
      inProgress: 0, completedInRange: 0, criticalOpen: 0,
    });
    expect(result.incidents).toEqual({
      active: 0, acknowledged: 0, criticalopen: 0, resolvedinrange: 0, createdinrange: 0,
      criticalOpen: 0, resolvedInRange: 0, createdInRange: 0,
    });
  });
});
