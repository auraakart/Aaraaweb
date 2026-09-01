import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GateAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(societyId: string, actorUserId: string, gateId: string, event: AuditEventType, visitorPassId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
    return this.prisma.auditEvent.create({ data: { societyId, actorUserId, gateId, event, visitorPassId } });
  }

  async list(societyId: string, gateId?: string, limit = 50) {
    return this.prisma.auditEvent.findMany({
      where: { societyId, ...(gateId ? { gateId } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }
}
