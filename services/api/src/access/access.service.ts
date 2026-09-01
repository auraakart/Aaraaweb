import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessRequestStatus, AccessSubjectType } from '@prisma/client';
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
    const link = await this.prisma.unitResident.findFirst({
      where: { societyId, userId, unitId, active: true },
    });
    if (!link) throw new ForbiddenException('Unit does not belong to authenticated resident');
  }

  private async assertGate(societyId: string, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
  }

  private credential() {
    const raw = randomBytes(24).toString('base64url');
    return { raw, hash: createHash('sha256').update(raw).digest('hex') };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  async create(
    societyId: string,
    userId: string,
    unitId: string,
    subjectType: AccessSubjectType,
    subjectName: string,
    subjectPhone?: string,
    purpose?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.assertSubjectEnabled(societyId, subjectType);
    await this.assertResidentUnit(societyId, userId, unitId);
    return this.prisma.accessRequest.create({
      data: {
        societyId,
        unitId,
        requestedById: userId,
        subjectType,
        subjectName: subjectName.trim(),
        subjectPhone: subjectPhone?.trim() || null,
        purpose: purpose?.trim() || null,
        metadata,
        status: AccessRequestStatus.PENDING,
      },
    });
  }

  listMine(societyId: string, userId: string) {
    return this.prisma.accessRequest.findMany({
      where: { societyId, requestedById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(societyId: string, userId: string, requestId: string, validFrom: Date, validUntil: Date) {
    if (validUntil <= validFrom) throw new BadRequestException('Access validity window is invalid');
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, societyId, requestedById: userId },
    });
    if (!request) throw new NotFoundException('Access request not found');
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    }
    await this.assertSubjectEnabled(societyId, request.subjectType);
    const credential = this.credential();
    const updated = await this.prisma.accessRequest.update({
      where: { id: request.id },
      data: {
        status: AccessRequestStatus.APPROVED,
        validFrom,
        validUntil,
        credentialHash: credential.hash,
      },
    });
    return { request: updated, credential: credential.raw };
  }

  async deny(societyId: string, userId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, societyId, requestedById: userId },
    });
    if (!request) throw new NotFoundException('Access request not found');
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    }
    return this.prisma.accessRequest.update({
      where: { id: request.id },
      data: { status: AccessRequestStatus.DENIED },
    });
  }

  async cancel(societyId: string, userId: string, requestId: string) {
    const request = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, societyId, requestedById: userId },
    });
    if (!request) throw new NotFoundException('Access request not found');
    if (![AccessRequestStatus.PENDING, AccessRequestStatus.APPROVED].includes(request.status)) {
      throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    }
    return this.prisma.accessRequest.update({
      where: { id: request.id },
      data: { status: AccessRequestStatus.CANCELLED, credentialHash: null },
    });
  }

  async verify(societyId: string, gateId: string, rawCredential: string) {
    await this.assertGate(societyId, gateId);
    const request = await this.prisma.accessRequest.findFirst({
      where: { societyId, credentialHash: this.hash(rawCredential) },
    });
    if (!request) throw new NotFoundException('Access credential not found');
    if (request.status !== AccessRequestStatus.APPROVED) {
      throw new BadRequestException(`Access request is ${request.status.toLowerCase()}`);
    }
    const now = new Date();
    if (!request.validFrom || !request.validUntil || now < request.validFrom || now > request.validUntil) {
      throw new BadRequestException('Access credential is outside its validity window');
    }
    await this.assertSubjectEnabled(societyId, request.subjectType);
    return request;
  }

  async checkIn(societyId: string, gateId: string, rawCredential: string) {
    const request = await this.verify(societyId, gateId, rawCredential);
    return this.prisma.accessRequest.update({
      where: { id: request.id },
      data: { status: AccessRequestStatus.CHECKED_IN, enteredAt: new Date() },
    });
  }

  async checkOut(societyId: string, gateId: string, rawCredential: string) {
    await this.assertGate(societyId, gateId);
    const request = await this.prisma.accessRequest.findFirst({
      where: {
        societyId,
        credentialHash: this.hash(rawCredential),
        status: AccessRequestStatus.CHECKED_IN,
        exitedAt: null,
      },
    });
    if (!request) throw new NotFoundException('Checked-in access request not found');
    return this.prisma.accessRequest.update({
      where: { id: request.id },
      data: { status: AccessRequestStatus.CHECKED_OUT, exitedAt: new Date() },
    });
  }
}
