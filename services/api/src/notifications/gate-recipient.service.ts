import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GateRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  async notificationRecipients(societyId: string, unitId: string, now = new Date()) {
    const occupants = await this.prisma.unitOccupancy.findMany({
      where: {
        societyId,
        unitId,
        active: true,
        gateNotificationEnabled: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
      select: { userId: true, gateApprovalEnabled: true },
    });
    return occupants;
  }
}
