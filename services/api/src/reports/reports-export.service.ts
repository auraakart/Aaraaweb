import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditEventType, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;
const MAX_EXPORT_ROWS = 5000;

@Injectable()
export class ReportsExportService {
  constructor(private readonly prisma: PrismaService) {}

  async maintenanceCsv(societyId: string, actorUserId: string, from?: string, to?: string) {
    const range = this.dateRange(from, to);
    const rows = await this.prisma.maintenanceInvoice.findMany({
      where: { societyId, issuedAt: range, status: { not: InvoiceStatus.VOID } },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: MAX_EXPORT_ROWS + 1,
      select: {
        invoiceNumber: true,
        billingPeriod: true,
        amountPaise: true,
        dueDate: true,
        status: true,
        issuedAt: true,
        paidAt: true,
        unit: { select: { number: true, building: { select: { name: true } } } },
      },
    });

    if (rows.length > MAX_EXPORT_ROWS) {
      throw new BadRequestException(`Report export cannot exceed ${MAX_EXPORT_ROWS} rows; narrow the date range`);
    }

    const header = ['invoiceNumber','billingPeriod','building','unit','amountPaise','dueDate','status','issuedAt','paidAt'];
    const lines = rows.map((row) => [
      row.invoiceNumber,
      row.billingPeriod,
      row.unit.building.name,
      row.unit.number,
      row.amountPaise,
      row.dueDate.toISOString().slice(0, 10),
      row.status,
      row.issuedAt.toISOString(),
      row.paidAt?.toISOString() ?? '',
    ].map((value) => this.csvCell(value)).join(','));

    await this.prisma.auditEvent.create({
      data: {
        societyId,
        actorUserId,
        event: 'REPORT_EXPORTED' as AuditEventType,
      },
    });

    const startStamp = range.gte.toISOString().slice(0, 10);
    const endStamp = range.lte.toISOString().slice(0, 10);
    return {
      fileName: `maintenance-report-${startStamp}-to-${endStamp}.csv`,
      rowCount: rows.length,
      csv: `${header.join(',')}\n${lines.join('\n')}${lines.length ? '\n' : ''}`,
    };
  }

  private csvCell(value: string | number) {
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
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
