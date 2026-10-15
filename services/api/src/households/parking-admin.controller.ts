import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';

class ParkingSlotDto {
  @IsOptional()
  @IsString()
  parkingSlot?: string;
}

@Controller('parking')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ParkingAdminController {
  constructor(private readonly prisma: PrismaService, private readonly households: HouseholdService) {}

  @Get('admin')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  async list(@CurrentTenant() societyId: string) {
    const households = await this.prisma.household.findMany({
      where: { societyId },
      select: {
        id: true,
        accessPreferences: true,
        unit: { select: { id: true, number: true, building: { select: { id: true, name: true, code: true } } } },
        vehicles: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true, plateNumber: true, vehicleType: true, make: true, model: true, color: true, createdAt: true },
        },
      },
      orderBy: { unit: { number: 'asc' } },
    });
    return households.flatMap((household) => {
      const slots = this.stringMap(this.jsonObject(household.accessPreferences).parkingSlots);
      return household.vehicles.map((vehicle) => ({
        householdId: household.id,
        unit: household.unit,
        vehicle,
        parkingSlot: slots[vehicle.id] ?? null,
      }));
    });
  }

  @Patch('admin/:householdId/vehicles/:vehicleId')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  update(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: ParkingSlotDto,
    @CurrentTenant() societyId: string,
  ) {
    return this.households.updateVehicleParkingSlot(societyId, householdId, vehicleId, dto.parkingSlot);
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Prisma.JsonObject;
  }

  private stringMap(value: Prisma.JsonValue | undefined): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Prisma.JsonObject).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  }
}
