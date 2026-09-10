import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HouseholdPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async updateResidentPreferences(
    societyId: string,
    userId: string,
    householdId: string,
    incoming: Record<string, unknown>,
  ) {
    await this.assertOwnerOrResidentHousehold(societyId, userId, householdId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Household" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
      const household = await tx.household.findFirst({ where: { id: householdId, societyId }, select: { id: true, accessPreferences: true } });
      if (!household) throw new NotFoundException('Household not found');
      const current = this.jsonObject(household.accessPreferences);
      const next: Prisma.JsonObject = {};
      for (const [key, value] of Object.entries(incoming)) {
        if (key === 'parkingSlots' || key === 'householdChangeRequests') continue;
        if (this.isJsonValue(value)) next[key] = value as Prisma.JsonValue;
      }
      if (current.parkingSlots !== undefined) next.parkingSlots = current.parkingSlots;
      if (current.householdChangeRequests !== undefined) next.householdChangeRequests = current.householdChangeRequests;
      return tx.household.update({ where: { id: household.id }, data: { accessPreferences: next as Prisma.InputJsonValue } });
    });
  }

  private async assertOwnerOrResidentHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId }, select: { unitId: true } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const [occupancy, ownership] = await Promise.all([
      this.prisma.unitOccupancy.findFirst({
        where: { societyId, unitId: household.unitId, userId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        select: { id: true },
      }),
      this.prisma.unitOwnership.findFirst({
        where: { societyId, unitId: household.unitId, userId, active: true, verified: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        select: { id: true },
      }),
    ]);
    if (!occupancy && !ownership) throw new BadRequestException('Household is outside the authenticated owner or resident context');
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Prisma.JsonObject) };
  }

  private isJsonValue(value: unknown): value is Prisma.JsonValue {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
    if (Array.isArray(value)) return value.every((item) => this.isJsonValue(item));
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every((item) => this.isJsonValue(item));
    return false;
  }
}
