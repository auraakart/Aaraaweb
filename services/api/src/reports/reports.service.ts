import { BadRequestException, Injectable } from '@nestjs/common';
import { AccessSubjectType, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditEventFilter } from './reports-filter';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(societyId: string, from?: string, to?: string, includeFinancialAmounts = false) {
    const range = this.dateRange(from, to);
    return this.summaryForRange(societyId, range, includeFinancialAmounts);
  }

  async summaryComparison(societyId: string, from?: string, to?: string, includeFinancialAmounts = false) {
    const currentRange = this.dateRange(from, to);
    const durationMs = currentRange.lte.getTime() - currentRange.gte.getTime();
    const previousRange = {
      gte: new Date(currentRange.gte.getTime() - durationMs - 1),
      lte: new Date(currentRange.gte.getTime() - 1),
    };
    const [current, previous] = await Promise.all([
      this.summaryForRange(societyId, currentRange, includeFinancialAmounts),
      this.summaryForRange(societyId, previousRange, includeFinancialAmounts),
    ]);
    return { current, previous };
  }

  private async summaryForRange(
    societyId: string,
    range: { gte: Date; lte: Date },
    includeFinancialAmounts: boolean,
  ) {
    const [
      visitorRequests,
      visitorEntries,
      workforceEntries,
      billed,
      collected,
      outstanding,
      helpdeskOpen,
      helpdeskInProgress,
      helpdeskResolved,
      helpdeskClosed,
      auditEvents,
    ] = await Promise.all([
      this.prisma.accessRequest.count({
        where: { societyId, subjectType: AccessSubjectType.VISITOR, createdAt: range },
      }),
      this.prisma.accessRequest.count({
        where: { societyId, subjectType: AccessSubjectType.VISITOR, enteredAt: range },
      }),
      this.prisma.accessRequest.count({
        where: { societyId, subjectType: AccessSubjectType.DOMESTIC_HELP, enteredAt: range },
      }),
      this.prisma.maintenanceInvoice.aggregate({
        where: { societyId, issuedAt: range, status: { not: InvoiceStatus.VOID } },
        _count: { _all: true },
        _sum: { amountPaise: true },
      }),
      this.prisma.maintenanceInvoice.aggregate({
        where: { societyId, paidAt: range, status: InvoiceStatus.PAID },
        _count: { _all: true },
        _sum: { amountPaise: true },
      }),
      this.prisma.maintenanceInvoice.aggregate({
        where: { societyId, status: InvoiceStatus.ISSUED },
        _count: { _all: true },
        _sum: { amountPaise: true },
      }),
      this.prisma.helpdeskTicket.count({ where: { societyId, status: 'OPEN', createdAt: range } }),
      this.prisma.helpdeskTicket.count({ where: { societyId, status: 'IN_PROGRESS', createdAt: range } }),
      this.prisma.helpdeskTicket.count({ where: { societyId, status: 'RESOLVED', createdAt: range } }),
      this.prisma.helpdeskTicket.count({ where: { societyId, status: 'CLOSED', createdAt: range } }),
      this.prisma.auditEvent.count({ where: { societyId, occurredAt: range } }),
    ]);

    return {
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
      access: {
        visitorRequests,
        visitorEntries,
        workforceEntries,
      },
      maintenance: {
        billedCount: billed._count._all,
        billedPaise: includeFinancialAmounts ? (billed._sum.amountPaise ?? 0) : null,
        collectedCount: collected._count._all,
        collectedPaise: includeFinancialAmounts ? (collected._sum.amountPaise ?? 0) : null,
        outstandingCount: outstanding._count._all,
        outstandingPaise: includeFinancialAmounts ? (outstanding._sum.amountPaise ?? 0) : null,
      },
      helpdesk: {
        open: helpdeskOpen,
        inProgress: helpdeskInProgress,
        resolved: helpdeskResolved,
        closed: helpdeskClosed,
      },
      audit: { eventCount: auditEvents },
    };
  }

  async accessFeed(
    societyId: string,
    subjectType: string,
    from?: string,
    to?: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ) {
    const range = this.dateRange(from, to);
    const paging = this.paging(page, pageSize);
    const type = this.accessSubjectType(subjectType);
    const where = { societyId, subjectType: type, createdAt: range };

    const [total, items] = await Promise.all([
      this.prisma.accessRequest.count({ where }),
      this.prisma.accessRequest.findMany({
        where,
        // A unique tie breaker keeps equal timestamps in a stable page order.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          subjectType: true,
          subjectName: true,
          purpose: true,
          status: true,
          createdAt: true,
          enteredAt: true,
          exitedAt: true,
          unit: {
            select: {
              number: true,
              building: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  async helpdeskFeed(
    societyId: string,
    from?: string,
    to?: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ) {
    const range = this.dateRange(from, to);
    const paging = this.paging(page, pageSize);
    const where = { societyId, createdAt: range };

    const [total, items] = await Promise.all([
      this.prisma.helpdeskTicket.count({ where }),
      this.prisma.helpdeskTicket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          title: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          closedAt: true,
          unit: {
            select: {
              number: true,
              building: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  async maintenanceFeed(
    societyId: string,
    from?: string,
    to?: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ) {
    const range = this.dateRange(from, to);
    const paging = this.paging(page, pageSize);
    const where = { societyId, issuedAt: range, status: { not: InvoiceStatus.VOID } };

    const [total, items] = await Promise.all([
      this.prisma.maintenanceInvoice.count({ where }),
      this.prisma.maintenanceInvoice.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          invoiceNumber: true,
          billingPeriod: true,
          amountPaise: true,
          dueDate: true,
          status: true,
          issuedAt: true,
          paidAt: true,
          unit: {
            select: {
              number: true,
              building: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  async auditFeed(societyId: string, page = 1, pageSize = 50, event?: string, from?: string, to?: string) {
    const paging = this.paging(page, pageSize);
    const eventType = auditEventFilter(event);
    const range = from || to ? this.dateRange(from, to) : undefined;
    const where = { societyId, ...(eventType ? { event: eventType } : {}), ...(range ? { occurredAt: range } : {}) };

    const [total, items] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          event: true,
          occurredAt: true,
          actorUserId: true,
          gateId: true,
          accessRequestId: true,
          visitorPassId: true,
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  private paging(page: number, pageSize: number) {
    if (!Number.isSafeInteger(page) || page < 1) throw new BadRequestException('page must be a positive safe integer');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new BadRequestException(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
    }
    const skip = (page - 1) * pageSize;
    // Validate the product too: valid operands can still overflow the safe integer range.
    if (!Number.isSafeInteger(skip)) throw new BadRequestException('page offset exceeds the supported range');
    return { skip, take: pageSize };
  }

  private accessSubjectType(value: string) {
    if (!Object.values(AccessSubjectType).includes(value as AccessSubjectType)) {
      throw new BadRequestException('subjectType must be a valid access subject type');
    }
    return value as AccessSubjectType;
  }

  private dateRange(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('from/to must be valid ISO-8601 dates');
    }
    if (start > end) throw new BadRequestException('from must be before to');
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
      throw new BadRequestException(`Report range cannot exceed ${MAX_WINDOW_DAYS} days`);
    }
    return { gte: start, lte: end };
  }
}
