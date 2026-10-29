import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GateAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(societyId: string, actorUserId: string, gateId: string, event: AuditEventType, visitorPassId: string, tx?: Prisma.TransactionClient) {
    const record = async (client: Prisma.TransactionClient) => {
      const gate = await client.gate.findFirst({ where: { id: gateId, societyId, active: true } });
      if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
      return client.auditEvent.create({ data: { societyId, actorUserId, gateId, event, visitorPassId } });
    };
    return tx ? record(tx) : this.prisma.withTenantContext(societyId, record);
  }

  async list(societyId: string, gateId?: string, limit = 50) {
    return this.prisma.withTenantContext(societyId, tx => tx.auditEvent.findMany({
      where: { societyId, ...(gateId ? { gateId } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    }));
  }
}
