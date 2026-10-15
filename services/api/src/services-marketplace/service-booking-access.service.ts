import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessRequestStatus, AccessSubjectType, AuditEventType, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

type ServiceBookingAccessInput = {
  societyId: string;
  userId: string;
  unitId: string;
  bookingId: string;
  providerId: string;
  offeringId: string;
  providerName: string;
  providerPhone?: string | null;
  offeringName: string;
  validFrom: Date;
  validUntil: Date;
};

@Injectable()
export class ServiceBookingAccessService {
  async createApproved(tx: Prisma.TransactionClient, input: ServiceBookingAccessInput) {
    const now = new Date();
    const [occupancy, ownership] = await Promise.all([
      tx.unitOccupancy.findFirst({
        where: {
          societyId: input.societyId,
          userId: input.userId,
          unitId: input.unitId,
          active: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        select: { id: true },
      }),
      tx.unitOwnership.findFirst({
        where: {
          societyId: input.societyId,
          userId: input.userId,
          unitId: input.unitId,
          active: true,
          verified: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        select: { id: true },
      }),
    ]);
    if (!occupancy && !ownership) {
      throw new ForbiddenException('Booking requester no longer has access to the selected unit');
    }

    const rawCredential = randomBytes(24).toString('base64url');
    const credentialHash = createHash('sha256').update(rawCredential).digest('hex');
    const request = await tx.accessRequest.create({
      data: {
        societyId: input.societyId,
        unitId: input.unitId,
        requestedById: input.userId,
        subjectType: AccessSubjectType.SERVICE_PROVIDER,
        subjectName: input.providerName.trim(),
        subjectPhone: input.providerPhone?.trim() || null,
        purpose: input.offeringName.trim(),
        metadata: {
          bookingId: input.bookingId,
          providerId: input.providerId,
          offeringId: input.offeringId,
        } as Prisma.InputJsonValue,
        status: AccessRequestStatus.APPROVED,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        credentialHash,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: input.societyId,
        actorUserId: input.userId,
        accessRequestId: request.id,
        event: AuditEventType.ACCESS_CREATED,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: input.societyId,
        actorUserId: input.userId,
        accessRequestId: request.id,
        event: AuditEventType.ACCESS_APPROVED,
      },
    });
    return { request, credential: rawCredential };
  }

  async cancelApproved(tx: Prisma.TransactionClient, societyId: string, userId: string, accessRequestId: string) {
    const request = await tx.accessRequest.findFirst({
      where: { id: accessRequestId, societyId, requestedById: userId },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Service booking access request not found');
    if (request.status !== AccessRequestStatus.PENDING && request.status !== AccessRequestStatus.APPROVED) {
      throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    }

    const changed = await tx.accessRequest.updateMany({
      where: {
        id: request.id,
        societyId,
        requestedById: userId,
        status: request.status,
      },
      data: { status: AccessRequestStatus.CANCELLED, credentialHash: null },
    });
    if (changed.count !== 1) throw new BadRequestException('Access request changed before cancellation could complete');
    await tx.auditEvent.create({
      data: {
        societyId,
        actorUserId: userId,
        accessRequestId: request.id,
        event: AuditEventType.ACCESS_CANCELLED,
      },
    });
  }
}
