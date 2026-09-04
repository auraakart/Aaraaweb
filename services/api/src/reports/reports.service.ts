import { BadRequestException, Injectable } from '@nestjs/common';
import { AccessSubjectType, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(societyId: string, from?: string, to?: string) {
    const range = this.dateRange(from, to);
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
        billedPaise: billed._sum.amountPaise ?? 0,
        collectedCount: collected._count._all,
        collectedPaise: collected._sum.amountPaise ?? 0,
        outstandingCount: outstanding._count._all,
        outstandingPaise: outstanding._sum.amountPaise ?? 0,
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

  async auditFeed(societyId: string, page = 1, pageSize = 50) {
    if (!Number.isInteger(page) || page < 1) throw new BadRequestException('page must be a positive integer');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('pageSize must be between 1 and 100');
    }

    const [total, items] = await Promise.all([
      this.prisma.auditEvent.count({ where: { societyId } }),
      this.prisma.auditEvent.findMany({
        where: { societyId },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
