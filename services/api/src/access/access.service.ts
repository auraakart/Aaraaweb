import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessRequestStatus, AccessSubjectType, AuditEventType, GateMutationAction, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';
import { PrismaService } from '../prisma/prisma.service';

const FEATURE_BY_SUBJECT: Readonly<Record<AccessSubjectType, ProductFeature>> = {
  [AccessSubjectType.VISITOR]: ProductFeature.VISITOR_MANAGEMENT,
  [AccessSubjectType.DELIVERY]: ProductFeature.DELIVERY_MANAGEMENT,
  [AccessSubjectType.CAB]: ProductFeature.DELIVERY_MANAGEMENT,
  [AccessSubjectType.DOMESTIC_HELP]: ProductFeature.DOMESTIC_HELP,
  [AccessSubjectType.VENDOR]: ProductFeature.HOUSEHOLD_SERVICES,
  [AccessSubjectType.SERVICE_PROVIDER]: ProductFeature.HOUSEHOLD_SERVICES,
  [AccessSubjectType.CONTRACTOR]: ProductFeature.HOUSEHOLD_SERVICES,
  [AccessSubjectType.OTHER]: ProductFeature.VISITOR_MANAGEMENT,
};

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService) {}

  private async assertSubjectEnabled(societyId: string, subjectType: AccessSubjectType) {
    const feature = FEATURE_BY_SUBJECT[subjectType];
    if (!(await this.entitlements.isEnabled(societyId, feature))) {
      throw new ForbiddenException(`Access type ${subjectType} is not enabled for this society`);
    }
  }

  private async assertResidentUnit(societyId: string, userId: string, unitId: string) {
    const link = await this.prisma.unitResident.findFirst({ where: { societyId, userId, unitId, active: true } });
    if (!link) throw new ForbiddenException('Unit does not belong to authenticated resident');
  }

  private async assertGate(societyId: string, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
    return gate;
  }

  private credential() {
    const raw = randomBytes(24).toString('base64url');
    return { raw, hash: createHash('sha256').update(raw).digest('hex') };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  async create(societyId: string, userId: string, unitId: string, subjectType: AccessSubjectType, subjectName: string, subjectPhone?: string, purpose?: string, metadata: Record<string, unknown> = {}) {
    await this.assertSubjectEnabled(societyId, subjectType);
    await this.assertResidentUnit(societyId, userId, unitId);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.accessRequest.create({ data: { societyId, unitId, requestedById: userId, subjectType, subjectName: subjectName.trim(), subjectPhone: subjectPhone?.trim() || null, purpose: purpose?.trim() || null, metadata: metadata as Prisma.InputJsonValue, status: AccessRequestStatus.PENDING } });
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, accessRequestId: request.id, event: AuditEventType.ACCESS_CREATED } });
      return request;
    });
  }

  async inviteVisitor(societyId: string, userId: string, unitId: string, subjectName: string, validFrom: Date, validUntil: Date, subjectPhone?: string, purpose?: string) {
    if (validUntil <= validFrom) throw new BadRequestException('Access validity window is invalid');
    await this.assertSubjectEnabled(societyId, AccessSubjectType.VISITOR);
    await this.assertResidentUnit(societyId, userId, unitId);
    const credential = this.credential();
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accessRequest.create({
        data: {
          societyId,
          unitId,
          requestedById: userId,
          subjectType: AccessSubjectType.VISITOR,
          subjectName: subjectName.trim(),
          subjectPhone: subjectPhone?.trim() || null,
          purpose: purpose?.trim() || null,
          status: AccessRequestStatus.APPROVED,
          validFrom,
          validUntil,
          credentialHash: credential.hash,
        },
      });
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, accessRequestId: created.id, event: AuditEventType.ACCESS_CREATED } });
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, accessRequestId: created.id, event: AuditEventType.ACCESS_APPROVED } });
      return created;
    });
    return { request, credential: credential.raw };
  }

  listMine(societyId: string, userId: string) {
    return this.prisma.accessRequest.findMany({ where: { societyId, requestedById: userId }, orderBy: { createdAt: 'desc' } });
  }

  async approve(societyId: string, userId: string, requestId: string, validFrom: Date, validUntil: Date) {
    if (validUntil <= validFrom) throw new BadRequestException('Access validity window is invalid');
    const request = await this.prisma.accessRequest.findFirst({ where: { id: requestId, societyId, requestedById: userId } });
    if (!request) throw new NotFoundException('Access request not found');
    if (request.status !== AccessRequestStatus.PENDING) throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    await this.assertSubjectEnabled(societyId, request.subjectType);
    const credential = this.credential();
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.accessRequest.updateMany({ where: { id: request.id, societyId, requestedById: userId, status: AccessRequestStatus.PENDING }, data: { status: AccessRequestStatus.APPROVED, validFrom, validUntil, credentialHash: credential.hash } });
      if (changed.count !== 1) throw new BadRequestException('Access request changed before approval could complete');
      const value = await tx.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, accessRequestId: request.id, event: AuditEventType.ACCESS_APPROVED } });
      return value;
    });
    return { request: updated, credential: credential.raw };
  }

  async deny(societyId: string, userId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({ where: { id: requestId, societyId, requestedById: userId } });
    if (!request) throw new NotFoundException('Access request not found');
    if (request.status !== AccessRequestStatus.PENDING) throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.accessRequest.updateMany({ where: { id: request.id, societyId, requestedById: userId, status: AccessRequestStatus.PENDING }, data: { status: AccessRequestStatus.DENIED } });
      if (changed.count !== 1) throw new BadRequestException('Access request changed before denial could complete');
      const value = await tx.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, accessRequestId: request.id, event: AuditEventType.ACCESS_DENIED } });
      return value;
    });
  }

  async cancel(societyId: string, userId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({ where: { id: requestId, societyId, requestedById: userId } });
    if (!request) throw new NotFoundException('Access request not found');
    if (request.status !== AccessRequestStatus.PENDING && request.status !== AccessRequestStatus.APPROVED) throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.accessRequest.updateMany({ where: { id: request.id, societyId, requestedById: userId, status: request.status }, data: { status: AccessRequestStatus.CANCELLED, credentialHash: null } });
      if (changed.count !== 1) throw new BadRequestException('Access request changed before cancellation could complete');
      const value = await tx.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
      await tx.auditEvent.create({ data: { societyId, actorUserId: userId, accessRequestId: request.id, event: AuditEventType.ACCESS_CANCELLED } });
      return value;
    });
  }

  async verify(societyId: string, gateId: string, rawCredential: string, actorUserId?: string) {
    await this.assertGate(societyId, gateId);
    const request = await this.prisma.accessRequest.findFirst({ where: { societyId, credentialHash: this.hash(rawCredential) } });
    if (!request) throw new NotFoundException('Access credential not found');
    if (request.status !== AccessRequestStatus.APPROVED) throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    const now = new Date();
    if (!request.validFrom || !request.validUntil || now < request.validFrom || now > request.validUntil) throw new BadRequestException('Access credential is outside its validity window');
    await this.assertSubjectEnabled(societyId, request.subjectType);
    if (actorUserId) await this.prisma.auditEvent.create({ data: { societyId, actorUserId, gateId, accessRequestId: request.id, event: AuditEventType.ACCESS_VERIFIED } });
    return request;
  }

  async checkIn(societyId: string, gateId: string, rawCredential: string, actorUserId: string, idempotencyKey: string) {
    const request = await this.verify(societyId, gateId, rawCredential);
    return this.gateMutation(societyId, gateId, request.id, actorUserId, idempotencyKey, GateMutationAction.CHECK_IN);
  }

  async checkOut(societyId: string, gateId: string, rawCredential: string, actorUserId: string, idempotencyKey: string) {
    await this.assertGate(societyId, gateId);
    const request = await this.prisma.accessRequest.findFirst({ where: { societyId, credentialHash: this.hash(rawCredential) } });
    if (!request) throw new NotFoundException('Access credential not found');
    return this.gateMutation(societyId, gateId, request.id, actorUserId, idempotencyKey, GateMutationAction.CHECK_OUT);
  }

  private async gateMutation(societyId: string, gateId: string, accessRequestId: string, actorUserId: string, idempotencyKey: string, action: GateMutationAction) {
    const key = idempotencyKey.trim();
    if (!key) throw new BadRequestException('Idempotency key is required');
    const existing = await this.prisma.gateMutationReceipt.findUnique({ where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } } });
    if (existing) {
      if (existing.accessRequestId !== accessRequestId || existing.gateId !== gateId || existing.action !== action) throw new BadRequestException('Idempotency key was already used for a different gate operation');
      return this.prisma.accessRequest.findUniqueOrThrow({ where: { id: existing.accessRequestId } });
    }
    const expectedStatus = action === GateMutationAction.CHECK_IN ? AccessRequestStatus.APPROVED : AccessRequestStatus.CHECKED_IN;
    const nextStatus = action === GateMutationAction.CHECK_IN ? AccessRequestStatus.CHECKED_IN : AccessRequestStatus.CHECKED_OUT;
    const event = action === GateMutationAction.CHECK_IN ? AuditEventType.ACCESS_CHECKED_IN : AuditEventType.ACCESS_CHECKED_OUT;
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await tx.accessRequest.updateMany({ where: { id: accessRequestId, societyId, status: expectedStatus }, data: action === GateMutationAction.CHECK_IN ? { status: nextStatus, enteredAt: now } : { status: nextStatus, exitedAt: now } });
        if (changed.count !== 1) throw new BadRequestException(`Access request is not ready for ${action === GateMutationAction.CHECK_IN ? 'check-in' : 'check-out'}`);
        await tx.gateMutationReceipt.create({ data: { societyId, gateId, accessRequestId, actorUserId, idempotencyKey: key, action } });
        await tx.auditEvent.create({ data: { societyId, actorUserId, gateId, accessRequestId, event } });
        return tx.accessRequest.findUniqueOrThrow({ where: { id: accessRequestId } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const receipt = await this.prisma.gateMutationReceipt.findUnique({ where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } } });
        if (receipt && receipt.accessRequestId === accessRequestId && receipt.gateId === gateId && receipt.action === action) return this.prisma.accessRequest.findUniqueOrThrow({ where: { id: accessRequestId } });
      }
      throw error;
    }
  }
}
