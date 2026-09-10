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
  constructor(private readonly prisma: PrismaService, private readonly households: HouseholdService) {}

  async requestFamilyAdd(societyId: string, userId: string, householdId: string, input: {
    name: string; phone: string; gateApprovalEnabled?: boolean; gateNotificationEnabled?: boolean;
    primaryGateContact?: boolean; escalationOrder?: number;
  }) {
    await this.assertVerifiedOwnerHousehold(societyId, userId, householdId);
    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || !phone) throw new BadRequestException('Family member name and phone are required');
    return this.appendRequest(societyId, householdId, {
      type: 'FAMILY_MEMBER_ADD', requestedByUserId: userId,
      payload: {
        name, phone,
        gateApprovalEnabled: input.gateApprovalEnabled ?? false,
        gateNotificationEnabled: input.gateNotificationEnabled ?? true,
        primaryGateContact: input.primaryGateContact ?? false,
        escalationOrder: input.escalationOrder ?? 100,
      },
    }, (r) => r.type === 'FAMILY_MEMBER_ADD' && r.status === 'PENDING' && r.payload.phone === phone);
  }

  async requestFamilyRemove(societyId: string, userId: string, householdId: string, occupancyId: string) {
    const household = await this.assertVerifiedOwnerHousehold(societyId, userId, householdId);
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { id: occupancyId, societyId, unitId: household.unitId, relation: UnitRelation.FAMILY_MEMBER, active: true },
    });
    if (!occupancy) throw new NotFoundException('Active family member not found');
    return this.appendRequest(societyId, householdId, {
      type: 'FAMILY_MEMBER_REMOVE', requestedByUserId: userId, targetId: occupancyId, payload: {},
    }, (r) => r.type === 'FAMILY_MEMBER_REMOVE' && r.status === 'PENDING' && r.targetId === occupancyId);
  }

  async requestVehicleAdd(societyId: string, userId: string, householdId: string, input: {
    plateNumber: string; vehicleType: VehicleType; make?: string; model?: string; color?: string;
  }) {
    await this.assertOwnerOrResidentHousehold(societyId, userId, householdId);
    const plateNumber = this.normalizePlate(input.plateNumber);
    if (!plateNumber) throw new BadRequestException('Vehicle registration number is required');
    const active = await this.prisma.householdVehicle.findFirst({ where: { societyId, plateNumber, active: true }, select: { id: true } });
    if (active) throw new BadRequestException('This vehicle is already registered in the society');
    return this.appendRequest(societyId, householdId, {
      type: 'VEHICLE_ADD', requestedByUserId: userId,
      payload: {
        plateNumber, vehicleType: input.vehicleType,
        make: input.make?.trim() || null, model: input.model?.trim() || null, color: input.color?.trim() || null,
      },
    }, (r) => r.type === 'VEHICLE_ADD' && r.status === 'PENDING' && r.payload.plateNumber === plateNumber);
  }

  async requestVehicleRemove(societyId: string, userId: string, householdId: string, vehicleId: string) {
    await this.assertOwnerOrResidentHousehold(societyId, userId, householdId);
    const vehicle = await this.prisma.householdVehicle.findFirst({ where: { id: vehicleId, householdId, societyId, active: true } });
    if (!vehicle) throw new NotFoundException('Active household vehicle not found');
    return this.appendRequest(societyId, householdId, {
      type: 'VEHICLE_REMOVE', requestedByUserId: userId, targetId: vehicleId, payload: { plateNumber: vehicle.plateNumber },
    }, (r) => r.type === 'VEHICLE_REMOVE' && r.status === 'PENDING' && r.targetId === vehicleId);
  }

  async listMine(societyId: string, userId: string) {
    const mine = await this.households.listMine(societyId, userId);
    return mine.flatMap((household) => this.requestsOf(household.accessPreferences)
      .filter((r) => r.requestedByUserId === userId)
      .map((r) => ({ ...r, householdId: household.id, unitId: household.unitId })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPending(societyId: string) {
    const rows = await this.prisma.household.findMany({
      where: { societyId },
      select: { id: true, unitId: true, accessPreferences: true, unit: { select: { number: true, building: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const requests = rows.flatMap((h) => this.requestsOf(h.accessPreferences)
      .filter((r) => r.status === 'PENDING')
      .map((r) => ({ ...r, householdId: h.id, unitId: h.unitId, unitNumber: h.unit.number, buildingName: h.unit.building.name })))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const ids = [...new Set(requests.map((r) => r.requestedByUserId))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return requests.map((r) => ({ ...r, requester: byId.get(r.requestedByUserId) ?? null }));
  }

  async approve(societyId: string, reviewerUserId: string, requestId: string, reviewNote?: string) {
    const located = await this.findRequest(societyId, requestId);
    if (located.request.status !== 'PENDING') throw new BadRequestException('Only pending requests can be approved');
    await this.replaceRequest(societyId, located.householdId, requestId, (r) => ({ ...r, status: 'PROCESSING' }));
    try {
      await this.apply(societyId, located.householdId, located.request);
      return this.replaceRequest(societyId, located.householdId, requestId, (r) => ({
        ...r, status: 'APPROVED', reviewedByUserId: reviewerUserId, reviewedAt: new Date().toISOString(),
        ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
      }));
    } catch (error) {
      await this.replaceRequest(societyId, located.householdId, requestId, (r) => r.status === 'PROCESSING' ? { ...r, status: 'PENDING' } : r);
      throw error;
    }
  }

  async reject(societyId: string, reviewerUserId: string, requestId: string, reviewNote?: string) {
    const located = await this.findRequest(societyId, requestId);
    if (located.request.status !== 'PENDING') throw new BadRequestException('Only pending requests can be rejected');
    return this.replaceRequest(societyId, located.householdId, requestId, (r) => ({
      ...r, status: 'REJECTED', reviewedByUserId: reviewerUserId, reviewedAt: new Date().toISOString(),
      ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
    }));
  }

  private async apply(societyId: string, householdId: string, r: StoredChangeRequest) {
    switch (r.type) {
      case 'FAMILY_MEMBER_ADD':
        return this.households.addFamilyMember(societyId, r.requestedByUserId, householdId, {
          name: String(r.payload.name ?? ''), phone: String(r.payload.phone ?? ''),
          gateApprovalEnabled: r.payload.gateApprovalEnabled === true,
          gateNotificationEnabled: r.payload.gateNotificationEnabled !== false,
          primaryGateContact: r.payload.primaryGateContact === true,
          escalationOrder: Number(r.payload.escalationOrder ?? 100),
        });
      case 'FAMILY_MEMBER_REMOVE':
        if (!r.targetId) throw new BadRequestException('Family member target is missing');
        return this.households.deactivateFamilyMember(societyId, r.requestedByUserId, householdId, r.targetId);
      case 'VEHICLE_ADD':
        return this.households.addVehicle(societyId, r.requestedByUserId, householdId, {
          plateNumber: String(r.payload.plateNumber ?? ''), vehicleType: r.payload.vehicleType as VehicleType,
          make: this.optionalText(r.payload.make), model: this.optionalText(r.payload.model), color: this.optionalText(r.payload.color),
        });
      case 'VEHICLE_REMOVE':
        if (!r.targetId) throw new BadRequestException('Vehicle target is missing');
        return this.households.deactivateVehicle(societyId, r.requestedByUserId, householdId, r.targetId);
    }
  }

  private async appendRequest(societyId: string, householdId: string, input: Omit<StoredChangeRequest, 'id' | 'status' | 'createdAt'>, duplicate: (r: StoredChangeRequest) => boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Household" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
      const household = await tx.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, accessPreferences: true } });
      if (!household) throw new NotFoundException('Household not found');
      const preferences = this.jsonObject(household.accessPreferences);
      const requests = this.requestsOf(preferences);
      if (requests.some(duplicate)) throw new BadRequestException('A matching request is already pending society approval');
      const request: StoredChangeRequest = { ...input, id: randomUUID(), status: 'PENDING', createdAt: new Date().toISOString() };
      preferences.householdChangeRequests = [...requests, request] as unknown as Prisma.JsonArray;
      await tx.household.update({ where: { id: household.id }, data: { accessPreferences: preferences as Prisma.InputJsonValue } });
      return { ...request, householdId };
    });
  }

  private async replaceRequest(societyId: string, householdId: string, requestId: string, change: (r: StoredChangeRequest) => StoredChangeRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Household" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
      const household = await tx.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, accessPreferences: true } });
      if (!household) throw new NotFoundException('Household not found');
      const preferences = this.jsonObject(household.accessPreferences);
      const requests = this.requestsOf(preferences);
      const index = requests.findIndex((r) => r.id === requestId);
      if (index < 0) throw new NotFoundException('Household change request not found');
      requests[index] = change(requests[index]);
      preferences.householdChangeRequests = requests as unknown as Prisma.JsonArray;
      await tx.household.update({ where: { id: household.id }, data: { accessPreferences: preferences as Prisma.InputJsonValue } });
      return { ...requests[index], householdId };
    });
  }

  private async findRequest(societyId: string, requestId: string) {
    const rows = await this.prisma.household.findMany({ where: { societyId }, select: { id: true, accessPreferences: true } });
    for (const h of rows) {
      const request = this.requestsOf(h.accessPreferences).find((r) => r.id === requestId);
      if (request) return { householdId: h.id, request };
    }
    throw new NotFoundException('Household change request not found');
  }

  private async assertVerifiedOwnerHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, unitId: true } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const ownership = await this.prisma.unitOwnership.findFirst({ where: {
      societyId, unitId: household.unitId, userId, active: true, verified: true,
      effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    } });
    if (!ownership) throw new BadRequestException('Only a verified current owner can manage family members for this unit');
    return household;
  }

  private async assertOwnerOrResidentHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, unitId: true } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const [occupancy, ownership] = await Promise.all([
      this.prisma.unitOccupancy.findFirst({ where: {
        societyId, unitId: household.unitId, userId, active: true,
        effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      }, select: { id: true } }),
      this.prisma.unitOwnership.findFirst({ where: {
        societyId, unitId: household.unitId, userId, active: true, verified: true,
        effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      }, select: { id: true } }),
    ]);
    if (!occupancy && !ownership) throw new BadRequestException('Vehicle changes require a verified current owner or active resident relationship with this unit');
    return household;
  }

  private normalizePlate(value: string) { return value.trim().toUpperCase().replace(/[\s-]+/g, ''); }
  private optionalText(value: unknown) { const text = typeof value === 'string' ? value.trim() : ''; return text || undefined; }
  private jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Prisma.JsonObject) };
  }
  private requestsOf(value: Prisma.JsonValue | null | undefined): StoredChangeRequest[] {
    const raw = this.jsonObject(value).householdChangeRequests;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => item as unknown as StoredChangeRequest)
      .filter((item) => typeof item.id === 'string' && typeof item.type === 'string' && typeof item.status === 'string' && typeof item.requestedByUserId === 'string');
  }
}
