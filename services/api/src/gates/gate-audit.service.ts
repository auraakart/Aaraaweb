import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type GateEvent = 'VISITOR_VERIFIED' | 'VISITOR_CHECKED_IN' | 'VISITOR_CHECKED_OUT';

@Injectable()
export class GateAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(societyId: string, actorUserId: string, gateId: string, event: GateEvent, visitorPassId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new Error('Gate does not belong to authenticated society or is inactive');
    return { societyId, actorUserId, gateId: gate.id, event, visitorPassId, occurredAt: new Date().toISOString() };
  }
}
