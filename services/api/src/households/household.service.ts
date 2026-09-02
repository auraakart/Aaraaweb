import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VehicleType } from '@prisma/client';
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
              where: { active: true },
              select: { relation: true, primaryGateContact: true, user: { select: { id: true, name: true } } },
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

    return this.prisma.household.create({
      data: {
        societyId,
        unitId,
        displayName: displayName?.trim() || null,
      },
    });
  }

  async updatePreferences(societyId: string, userId: string, householdId: string, preferences: Record<string, unknown>) {
    const household = await this.assertOwnHousehold(societyId, userId, householdId);
    return this.prisma.household.update({
      where: { id: household.id },
      data: { accessPreferences: preferences as Prisma.InputJsonValue },
    });
  }

  async addVehicle(
    societyId: string,
    userId: string,
    householdId: string,
    input: { plateNumber: string; vehicleType: VehicleType; make?: string; model?: string; color?: string },
  ) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    const plateNumber = input.plateNumber.trim().toUpperCase().replace(/[\s-]+/g, '');
    if (!plateNumber) throw new BadRequestException('Vehicle registration number is required');

    return this.prisma.householdVehicle.create({
      data: {
        societyId,
        householdId,
        plateNumber,
        vehicleType: input.vehicleType,
        make: input.make?.trim() || null,
        model: input.model?.trim() || null,
        color: input.color?.trim() || null,
      },
    });
  }

  async deactivateVehicle(societyId: string, userId: string, householdId: string, vehicleId: string) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    const vehicle = await this.prisma.householdVehicle.findFirst({ where: { id: vehicleId, householdId, societyId, active: true } });
    if (!vehicle) throw new NotFoundException('Active household vehicle not found');
    return this.prisma.householdVehicle.update({ where: { id: vehicle.id }, data: { active: false } });
  }

  async addEmergencyContact(
    societyId: string,
    userId: string,
    householdId: string,
    input: { name: string; phone: string; relation?: string; priority?: number },
  ) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    return this.prisma.emergencyContact.create({
      data: {
        societyId,
        householdId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        relation: input.relation?.trim() || null,
        priority: input.priority ?? 1,
      },
    });
  }

  async deactivateEmergencyContact(societyId: string, userId: string, householdId: string, contactId: string) {
    await this.assertOwnHousehold(societyId, userId, householdId);
    const contact = await this.prisma.emergencyContact.findFirst({ where: { id: contactId, householdId, societyId, active: true } });
    if (!contact) throw new NotFoundException('Active emergency contact not found');
    return this.prisma.emergencyContact.update({ where: { id: contact.id }, data: { active: false } });
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
}
