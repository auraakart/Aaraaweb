import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitRelation, VehicleType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';

type ChangeType = 'FAMILY_MEMBER_ADD' | 'FAMILY_MEMBER_REMOVE' | 'VEHICLE_ADD' | 'VEHICLE_REMOVE';
type ChangeStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED';

type StoredChangeRequest = {
  id: string;
  type: ChangeType;
  status: ChangeStatus;
  requestedByUserId: string;
  targetId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNote?: string;
};

@Injectable()
export class HouseholdChangeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdService,
  ) {}

  async requestFamilyAdd(
    societyId: string,
    userId: string,
    householdId: string,
    input: {
      name: string;
      phone: string;
      gateApprovalEnabled?: boolean;
      gateNotificationEnabled?: boolean;
      primaryGateContact?: boolean;
      escalationOrder?: number;
    },
  ) {
    await this.assertVerifiedOwnerHousehold(societyId, userId, householdId);
    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || !phone) throw new BadRequestException('Family member name and phone are required');
    return this.appendRequest(societyId, householdId, {
      type: 'FAMILY_MEMBER_ADD',
      requestedByUserId: userId,
      payload: {
        name,
        phone,
        gateApprovalEnabled: input.gateApprovalEnabled ?? false,
        gateNotificationEnabled: input.gateNotificationEnabled ?? true,
        primaryGateContact: input.primaryGateContact ?? false,
        escalationOrder: input.escalationOrder ?? 100,
      },
    }, (existing) => existing.type === 'FAMILY_MEMBER_ADD' && existing.status === 'PENDING' && existing.payload.phone === phone);
  }

  async requestFamilyRemove(societyId: string, userId: string, householdId: string, occupancyId: string) {
    const household = await this.assertVerifiedOwnerHousehold(societyId, userId, householdId);
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { id: occupancyId, societyId, unitId: household.unitId, relation: UnitRelation.FAMILY_MEMBER, active: true },
    });
    if (!occupancy) throw new NotFoundException('Active family member not found');
    return this.appendRequest(societyId, householdId, {
      type: 'FAMILY_MEMBER_REMOVE', requestedByUserId: userId, targetId: occupancyId, payload: {},
    }, (existing) => existing.type === 'FAMILY_MEMBER_REMOVE' && existing.status === 'PENDING' && existing.targetId === occupancyId);
  }

  async requestVehicleAdd(
    societyId: string,
    userId: string,
    householdId: string,
    input: { plateNumber: string; vehicleType: VehicleType; make?: string; model?: string; color?: string },
  ) {
    await this.assertResidentHousehold(societyId, userId, householdId);
    const plateNumber = this.normalizePlate(input.plateNumber);
    if (!plateNumber) throw new BadRequestException('Vehicle registration number is required');
    const active = await this.prisma.householdVehicle.findFirst({ where: { societyId, plateNumber, active: true } });
    if (active) throw new BadRequestException('This vehicle is already registered in the society');
    return this.appendRequest(societyId, householdId, {
      type: 'VEHICLE_ADD', requestedByUserId: userId, payload: {
        plateNumber,
        vehicleType: input.vehicleType,
        make: input.make?.trim() || null,
        model: input.model?.trim() || null,
        color: input.color?.trim() || null,
      },
    }, (existing) => existing.type === 'VEHICLE_ADD' && existing.status === 'PENDING' && existing.payload.plateNumber === plateNumber);
  }

  async requestVehicleRemove(societyId: string, userId: string, householdId: string, vehicleId: string) {
    await this.assertResidentHousehold(societyId, userId, householdId);
    const vehicle = await this.prisma.householdVehicle.findFirst({ where: { id: vehicleId, householdId, societyId, active: true } });
    if (!vehicle) throw new NotFoundException('Active household vehicle not found');
    return this.appendRequest(societyId, householdId, {
      type: 'VEHICLE_REMOVE', requestedByUserId: userId, targetId: vehicleId,
      payload: { plateNumber: vehicle.plateNumber },
    }, (existing) => existing.type === 'VEHICLE_REMOVE' && existing.status === 'PENDING' && existing.targetId === vehicleId);
  }

  async listMine(societyId: string, userId: string) {
    const mine = await this.households.listMine(societyId, userId);
    return mine.flatMap((household) => this.requestsOf(household.accessPreferences)
      .filter((request) => request.requestedByUserId === userId)
      .map((request) => ({
        ...request,
        householdId: household.id,
        unitId: household.unitId,
        unitNumber: household.unit.number,
        buildingName: household.unit.building.name,
      })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPending(societyId: string) {
    const rows = await this.prisma.household.findMany({
      where: { societyId },
      select: {
        id: true, unitId: true, accessPreferences: true,
        unit: { select: { number: true, building: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const requests = rows.flatMap((household) => this.requestsOf(household.accessPreferences)
      .filter((request) => request.status === 'PENDING')
      .map((request) => ({
        ...request,
        householdId: household.id,
        unitId: household.unitId,
        unitNumber: household.unit.number,
        buildingName: household.unit.building.name,
      })));
    const requesterIds = [...new Set(requests.map((request) => request.requestedByUserId))];
    const users = requesterIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, phone: true } })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return requests
      .map((request) => ({ ...request, requester: byId.get(request.requestedByUserId) ?? null }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async approve(societyId: string, reviewerUserId: string, requestId: string, reviewNote?: string) {
    const claimed = await this.claim(societyId, requestId);
    try {
      await this.applyApprovedChange(societyId, claimed.householdId, claimed.request);
      return await this.finishReview(societyId, claimed.householdId, requestId, 'APPROVED', reviewerUserId, reviewNote);
    } catch (error) {
      await this.revertClaim(societyId, claimed.householdId, requestId);
      throw error;
    }
  }

  async reject(societyId: string, reviewerUserId: string, requestId: string, reviewNote?: string) {
    const located = await this.findRequest(societyId, requestId);
    if (located.request.status !== 'PENDING') throw new BadRequestException('Only pending requests can be rejected');
    return this.finishReview(societyId, located.householdId, requestId, 'REJECTED', reviewerUserId, reviewNote);
  }

  private async applyApprovedChange(societyId: string, householdId: string, request: StoredChangeRequest) {
    const requester = request.requestedByUserId;
    switch (request.type) {
      case 'FAMILY_MEMBER_ADD':
        await this.households.addFamilyMember(societyId, requester, householdId, {
          name: String(request.payload.name ?? ''),
          phone: String(request.payload.phone ?? ''),
          gateApprovalEnabled: request.payload.gateApprovalEnabled === true,
          gateNotificationEnabled: request.payload.gateNotificationEnabled !== false,
          primaryGateContact: request.payload.primaryGateContact === true,
          escalationOrder: Number(request.payload.escalationOrder ?? 100),
        });
        return;
      case 'FAMILY_MEMBER_REMOVE':
        if (!request.targetId) throw new BadRequestException('Family member target is missing');
        await this.households.deactivateFamilyMember(societyId, requester, householdId, request.targetId);
        return;
      case 'VEHICLE_ADD':
        await this.households.addVehicle(societyId, requester, householdId, {
          plateNumber: String(request.payload.plateNumber ?? ''),
          vehicleType: request.payload.vehicleType as VehicleType,
          make: this.optionalText(request.payload.make),
          model: this.optionalText(request.payload.model),
          color: this.optionalText(request.payload.color),
        });
        return;
      case 'VEHICLE_REMOVE':
        if (!request.targetId) throw new BadRequestException('Vehicle target is missing');
        await this.households.deactivateVehicle(societyId, requester, householdId, request.targetId);
        return;
    }
  }

  private async appendRequest(
    societyId: string,
    householdId: string,
    input: Omit<StoredChangeRequest, 'id' | 'status' | 'createdAt'>,
    duplicate: (request: StoredChangeRequest) => boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Household" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
      const household = await tx.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, accessPreferences: true } });
      if (!household) throw new NotFoundException('Household not found');
      const preferences = this.jsonObject(household.accessPreferences);
      const requests = this.requestsOf(preferences);
      if (requests.some(duplicate)) throw new BadRequestException('A matching request is already pending society approval');
      const request: StoredChangeRequest = {
        ...input,
        id: randomUUID(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };
      preferences.householdChangeRequests = [...requests, request] as unknown as Prisma.InputJsonValue;
      await tx.household.update({ where: { id: household.id }, data: { accessPreferences: preferences as Prisma.InputJsonValue } });
      return { ...request, householdId };
    });
  }

  private async claim(societyId: string, requestId: string) {
    const located = await this.findRequest(societyId, requestId);
    if (located.request.status !== 'PENDING') throw new BadRequestException('Only pending requests can be approved');
    await this.replaceRequest(societyId, located.householdId, requestId, (request) => ({ ...request, status: 'PROCESSING' }));
    return located;
  }

  private async revertClaim(societyId: string, householdId: string, requestId: string) {
    try {
      await this.replaceRequest(societyId, householdId, requestId, (request) => request.status === 'PROCESSING' ? { ...request, status: 'PENDING' } : request);
    } catch (_) {}
  }

  private async finishReview(
    societyId: string,
    householdId: string,
    requestId: string,
    status: Extract<ChangeStatus, 'APPROVED' | 'REJECTED'>,
    reviewerUserId: string,
    reviewNote?: string,
  ) {
    return this.replaceRequest(societyId, householdId, requestId, (request) => ({
      ...request,
      status,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date().toISOString(),
      ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
    }));
  }

  private async replaceRequest(
    societyId: string,
    householdId: string,
    requestId: string,
    change: (request: StoredChangeRequest) => StoredChangeRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Household" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
      const household = await tx.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, accessPreferences: true } });
      if (!household) throw new NotFoundException('Household not found');
      const preferences = this.jsonObject(household.accessPreferences);
      const requests = this.requestsOf(preferences);
      const index = requests.findIndex((request) => request.id === requestId);
      if (index < 0) throw new NotFoundException('Household change request not found');
      const updated = change(requests[index]);
      requests[index] = updated;
      preferences.householdChangeRequests = requests as unknown as Prisma.InputJsonValue;
      await tx.household.update({ where: { id: household.id }, data: { accessPreferences: preferences as Prisma.InputJsonValue } });
      return { ...updated, householdId };
    });
  }

  private async findRequest(societyId: string, requestId: string) {
    const households = await this.prisma.household.findMany({ where: { societyId }, select: { id: true, accessPreferences: true } });
    for (const household of households) {
      const request = this.requestsOf(household.accessPreferences).find((item) => item.id === requestId);
      if (request) return { householdId: household.id, request };
    }
    throw new NotFoundException('Household change request not found');
  }

  private async assertVerifiedOwnerHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, unitId: true } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const ownership = await this.prisma.unitOwnership.findFirst({
      where: { societyId, unitId: household.unitId, userId, active: true, verified: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    });
    if (!ownership) throw new BadRequestException('Only a verified current owner can manage family members for this unit');
    return household;
  }

  private async assertResidentHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, unitId: true } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { societyId, unitId: household.unitId, userId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    });
    if (!occupancy) throw new BadRequestException('Household is outside the authenticated resident context');
    return household;
  }

  private requestsOf(value: Prisma.JsonValue | Prisma.JsonObject | null | undefined): StoredChangeRequest[] {
    const preferences = this.jsonObject(value);
    const raw = preferences.householdChangeRequests;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Prisma.JsonObject => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        id: String(item.id ?? ''),
        type: String(item.type ?? '') as ChangeType,
        status: String(item.status ?? 'PENDING') as ChangeStatus,
        requestedByUserId: String(item.requestedByUserId ?? ''),
        ...(item.targetId ? { targetId: String(item.targetId) } : {}),
        payload: this.jsonRecord(item.payload),
        createdAt: String(item.createdAt ?? ''),
        ...(item.reviewedByUserId ? { reviewedByUserId: String(item.reviewedByUserId) } : {}),
        ...(item.reviewedAt ? { reviewedAt: String(item.reviewedAt) } : {}),
        ...(item.reviewNote ? { reviewNote: String(item.reviewNote) } : {}),
      }))
      .filter((item) => item.id && item.requestedByUserId && ['FAMILY_MEMBER_ADD', 'FAMILY_MEMBER_REMOVE', 'VEHICLE_ADD', 'VEHICLE_REMOVE'].includes(item.type));
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Prisma.JsonObject) };
  }

  private jsonRecord(value: Prisma.JsonValue | undefined): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Prisma.JsonObject) };
  }

  private normalizePlate(value: string) {
    return value.trim().toUpperCase().replace(/[\s-]+/g, '');
  }

  private optionalText(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || undefined;
  }
}
