import { BadRequestException, Injectable } from '@nestjs/common';
import { AccessRequestStatus, AccessSubjectType, AuditEventType, Prisma } from '@prisma/client';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GateArrivalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async create(
    societyId: string,
    actorUserId: string,
    gateId: string,
    unitId: string,
    subjectType: AccessSubjectType,
    name: string,
    provider?: string,
    phone?: string,
    vehicleNumber?: string,
    note?: string,
  ) {
    if (subjectType !== AccessSubjectType.DELIVERY && subjectType !== AccessSubjectType.CAB) {
      throw new BadRequestException('Gate arrival type must be DELIVERY or CAB');
    }
    if (!(await this.entitlements.isEnabled(societyId, ProductFeature.DELIVERY_MANAGEMENT))) {
      throw new BadRequestException('Delivery management is not enabled for this society');
    }

    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');

    const now = new Date();
    const destination = await this.prisma.unit.findFirst({
      where: { id: unitId, societyId },
      select: {
        id: true,
        occupancies: {
          where: { active: true, gateApprovalEnabled: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
          take: 1,
          select: { userId: true },
        },
      },
    });
    const hostUserId = destination?.occupancies[0]?.userId;
    if (!destination || !hostUserId) throw new BadRequestException('Destination unit does not have an active resident');

    const metadata = {
      source: 'GATE_QUICK_ARRIVAL',
      gateId,
      createdByGuardId: actorUserId,
      provider: provider?.trim() || null,
      vehicleNumber: vehicleNumber?.trim().toUpperCase() || null,
      approvalWindowMinutes: subjectType === AccessSubjectType.CAB ? 15 : 30,
    };

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.accessRequest.create({
        data: {
          societyId,
          unitId,
          requestedById: hostUserId,
          subjectType,
          subjectName: name.trim(),
          subjectPhone: phone?.trim() || null,
          purpose: note?.trim() || (subjectType === AccessSubjectType.CAB ? 'Cab pickup/drop' : 'Delivery'),
          metadata: metadata as Prisma.InputJsonValue,
          status: AccessRequestStatus.PENDING,
        },
      });
      await tx.auditEvent.create({
        data: {
          societyId,
          actorUserId,
          gateId,
          accessRequestId: request.id,
          event: AuditEventType.ACCESS_CREATED,
        },
      });
      return request;
    });
  }
}
