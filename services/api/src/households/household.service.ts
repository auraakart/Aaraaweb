import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma, UnitRelation, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HouseholdService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(societyId: string, userId: string) {
    const now = new Date();
    const links = await this.prisma.unitOccupancy.findMany({
      where: { societyId, userId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      select: { unitId: true },
    });
    if (!links.length) return [];
    return this.prisma.household.findMany({
      where: { societyId, unitId: { in: links.map((link) => link.unitId) } },
      include: {
        unit: {
          include: {
            building: true,
            occupancies: {
              where: { active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
              select: {
                id: true, relation: true, primaryGateContact: true, gateApprovalEnabled: true,
                gateNotificationEnabled: true, escalationOrder: true,
                user: { select: { id: true, name: true, phone: true, status: true } },
              },
              orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
        vehicles: { where: { active: true }, orderBy: { createdAt: 'desc' } },
        emergencyContacts: { where: { active: true }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(societyId: string, userId: string, unitId: string, displayName?: string) {
    await this.assertResidentUnit(societyId, userId, unitId);
    const existing = await this.prisma.household.findUnique({ where: { unitId } });
    if (existing) throw new BadRequestException('A household already exists for this unit');
    return this.prisma.household.create({ data: { societyId, unitId, displayName: displayName?.trim() || null } });
  }

  async addFamilyMember(societyId: string, ownerUserId: string, householdId: string, input: {
    name: string; phone: string; gateApprovalEnabled?: boolean; gateNotificationEnabled?: boolean;
    primaryGateContact?: boolean; escalationOrder?: number;
  }) {
    const household = await this.assertVerifiedOwnerHousehold(societyId, ownerUserId, householdId);
    const phone = input.phone.trim();
    const name = input.name.trim();
    if (!phone || !name) throw new BadRequestException('Family member name and phone are required');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      let member = await tx.user.findUnique({ where: { phone } });
      if (!member) member = await tx.user.create({ data: { phone, name } });
      if (member.id === ownerUserId) throw new BadRequestException('Owner is already linked to this home');
      const conflicting = await tx.unitOccupancy.findFirst({
        where: {
          societyId, unitId: household.unitId, userId: member.id, active: true,
          relation: { in: [UnitRelation.OWNER, UnitRelation.TENANT] }, effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      });
      if (conflicting) throw new BadRequestException('This person already has an owner or tenant relationship with the unit');
      const existing = await tx.unitOccupancy.findFirst({
        where: { societyId, unitId: household.unitId, userId: member.id, relation: UnitRelation.FAMILY_MEMBER, active: true },
      });
      const primaryGateContact = input.primaryGateContact ?? existing?.primaryGateContact ?? false;
      if (primaryGateContact) {
        await tx.unitOccupancy.updateMany({
          where: { societyId, unitId: household.unitId, active: true, primaryGateContact: true },
          data: { primaryGateContact: false },
        });
      }
      const data = {
        societyId,
        relation: UnitRelation.FAMILY_MEMBER,
        active: true,
        effectiveFrom: existing?.effectiveFrom ?? now,
        effectiveTo: null,
        primaryGateContact,
        gateApprovalEnabled: input.gateApprovalEnabled ?? existing?.gateApprovalEnabled ?? false,
        gateNotificationEnabled: primaryGateContact ? true : (input.gateNotificationEnabled ?? existing?.gateNotificationEnabled ?? true),
        escalationOrder: input.escalationOrder ?? existing?.escalationOrder ?? 100,
      };
      const occupancy = existing
        ? await tx.unitOccupancy.update({ where: { id: existing.id }, data })
        : await tx.unitOccupancy.create({ data: { unitId: household.unitId, userId: member.id, ...data } });
      await tx.societyMembership.upsert({
        where: { userId_societyId_role: { userId: member.id, societyId, role: MembershipRole.FAMILY_MEMBER } },
        update: { active: true },
        create: { userId: member.id, societyId, role: MembershipRole.FAMILY_MEMBER, active: true },
      });
      return { ...occupancy, user: { id: member.id, name: member.name, phone: member.phone, status: member.status } };
    });
  }

  async updateFamilyMember(societyId: string, ownerUserId: string, householdId: string, occupancyId: string, input: {
    gateApprovalEnabled?: boolean; gateNotificationEnabled?: boolean; primaryGateContact?: boolean; escalationOrder?: number;
  }) {
    const household = await this.assertVerifiedOwnerHousehold(societyId, ownerUserId, householdId);
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { id: occupancyId, societyId, unitId: household.unitId, relation: UnitRelation.FAMILY_MEMBER, active: true },
    });
    if (!occupancy) throw new NotFoundException('Active family member not found');
    return this.prisma.$transaction(async (tx) => {
      if (input.primaryGateContact === true) {
        await tx.unitOccupancy.updateMany({
          where: { societyId, unitId: household.unitId, active: true, primaryGateContact: true, id: { not: occupancy.id } },
          data: { primaryGateContact: false },
        });
      }
      const data: Prisma.UnitOccupancyUpdateInput = {
        ...(input.gateApprovalEnabled !== undefined ? { gateApprovalEnabled: input.gateApprovalEnabled } : {}),
        ...((input.gateNotificationEnabled !== undefined || input.primaryGateContact === true)
          ? { gateNotificationEnabled: input.primaryGateContact === true ? true : input.gateNotificationEnabled }
          : {}),
        ...(input.primaryGateContact !== undefined ? { primaryGateContact: input.primaryGateContact } : {}),
        ...(input.escalationOrder !== undefined ? { escalationOrder: input.escalationOrder } : {}),
      };
      return tx.unitOccupancy.update({ where: { id: occupancy.id }, data });
    });
  }

  async deactivateFamilyMember(societyId: string, ownerUserId: string, householdId: string, occupancyId: string) {
    const household = await this.assertVerifiedOwnerHousehold(societyId, ownerUserId, householdId);
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { id: occupancyId, societyId, unitId: household.unitId, relation: UnitRelation.FAMILY_MEMBER, active: true },
    });
    if (!occupancy) throw new NotFoundException('Active family member not found');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.unitOccupancy.update({
        where: { id: occupancy.id },
        data: { active: false, effectiveTo: now, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false },
      });
      if (occupancy.primaryGateContact) {
        const fallback = await tx.unitOccupancy.findFirst({
          where: {
            societyId, unitId: household.unitId, active: true, gateNotificationEnabled: true,
            effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: [{ escalationOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (fallback) await tx.unitOccupancy.update({ where: { id: fallback.id }, data: { primaryGateContact: true } });
      }
      const remainingFamily = await tx.unitOccupancy.count({
        where: {
          societyId, userId: occupancy.userId, relation: UnitRelation.FAMILY_MEMBER, active: true,
          effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      });
      if (remainingFamily === 0) {
        await tx.societyMembership.updateMany({
          where: { userId: occupancy.userId, societyId, role: MembershipRole.FAMILY_MEMBER, active: true },
          data: { active: false },
        });
      }
      return ended;
    });
  }

  async updatePreferences(societyId: string, userId: string, householdId: string, preferences: Record<string, unknown>) {
    const household = await this.assertOwnHousehold(societyId, userId, householdId);
    return this.prisma.household.update({ where: { id: household.id }, data: { accessPreferences: preferences as Prisma.InputJsonValue } });
  }

  async addVehicle(societyId: string, userId: string, householdId: string, input: { plateNumber: string; vehicleType: VehicleType; make?: string; model?: string; color?: string; parkingSlot?: string }) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    const plateNumber = input.plateNumber.trim().toUpperCase().replace(/[\s-]+/g, '');
    if (!plateNumber) throw new BadRequestException('Vehicle registration number is required');
    const vehicle = await this.prisma.householdVehicle.create({
      data: { societyId, householdId, plateNumber, vehicleType: input.vehicleType, make: input.make?.trim() || null, model: input.model?.trim() || null, color: input.color?.trim() || null },
    });
    const parkingSlot = input.parkingSlot?.trim();
    if (parkingSlot) await this.updateVehicleParkingSlot(societyId, userId, householdId, vehicle.id, parkingSlot);
    return vehicle;
  }

  async updateVehicleParkingSlot(societyId: string, userId: string, householdId: string, vehicleId: string, parkingSlot?: string) {
    const household = await this.assertOwnHousehold(societyId, userId, householdId);
    const vehicle = await this.prisma.householdVehicle.findFirst({ where: { id: vehicleId, householdId, societyId, active: true } });
    if (!vehicle) throw new NotFoundException('Active household vehicle not found');

    const preferences = this.jsonObject(household.accessPreferences);
    const parkingSlots = this.stringMap(preferences.parkingSlots);
    const normalizedSlot = parkingSlot?.trim();
    if (normalizedSlot) parkingSlots[vehicle.id] = normalizedSlot;
    else delete parkingSlots[vehicle.id];
    preferences.parkingSlots = parkingSlots;

    await this.prisma.household.update({
      where: { id: household.id },
      data: { accessPreferences: preferences as Prisma.InputJsonValue },
    });
    return { vehicleId: vehicle.id, parkingSlot: normalizedSlot || null };
  }

  async deactivateVehicle(societyId: string, userId: string, householdId: string, vehicleId: string) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    const vehicle = await this.prisma.householdVehicle.findFirst({ where: { id: vehicleId, householdId, societyId, active: true } });
    if (!vehicle) throw new NotFoundException('Active household vehicle not found');
    await this.updateVehicleParkingSlot(societyId, userId, householdId, vehicle.id, undefined);
    return this.prisma.householdVehicle.update({ where: { id: vehicle.id }, data: { active: false } });
  }

  async addEmergencyContact(societyId: string, userId: string, householdId: string, input: { name: string; phone: string; relation?: string; priority?: number }) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    return this.prisma.emergencyContact.create({
      data: { societyId, householdId, name: input.name.trim(), phone: input.phone.trim(), relation: input.relation?.trim() || null, priority: input.priority ?? 1 },
    });
  }

  async deactivateEmergencyContact(societyId: string, userId: string, householdId: string, contactId: string) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    const contact = await this.prisma.emergencyContact.findFirst({ where: { id: contactId, householdId, societyId, active: true } });
    if (!contact) throw new NotFoundException('Active emergency contact not found');
    return this.prisma.emergencyContact.update({ where: { id: contact.id }, data: { active: false } });
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Prisma.JsonObject) };
  }

  private stringMap(value: Prisma.JsonValue | undefined): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Prisma.JsonObject).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  }

  private async assertResidentUnit(societyId: string, userId: string, unitId: string) {
    const now = new Date();
    const link = await this.prisma.unitOccupancy.findFirst({
      where: { societyId, userId, unitId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    });
    if (!link) throw new BadRequestException('Unit does not belong to the authenticated resident');
    return link;
  }

  private async assertOwnHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId } });
    if (!household) throw new NotFoundException('Household not found');
    await this.assertResidentUnit(societyId, userId, household.unitId);
    return household;
  }

  private async assertVerifiedOwnerHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const ownership = await this.prisma.unitOwnership.findFirst({
      where: {
        societyId, unitId: household.unitId, userId, active: true, verified: true,
        effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
    });
    if (!ownership) throw new BadRequestException('Only a verified current owner can manage family members for this unit');
    return household;
  }
}
