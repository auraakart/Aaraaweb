import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type FloorRow = {
  id: string;
  societyId: string;
  buildingId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type UnitFloorLink = { id: string; floorId: string | null };

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  listBuildings(societyId: string) {
    return this.prisma.building.findMany({
      where: { societyId },
      orderBy: { name: 'asc' },
      include: { units: { orderBy: { number: 'asc' } } },
    });
  }

  async createBuilding(societyId: string, name: string, code: string) {
    return this.prisma.building.create({ data: { societyId, name: name.trim(), code: code.trim().toUpperCase() } });
  }

  async listFloors(societyId: string, buildingId: string) {
    await this.assertBuilding(societyId, buildingId);
    return this.prisma.$queryRaw<FloorRow[]>(Prisma.sql`
      SELECT "id", "societyId", "buildingId", "name", "sortOrder", "createdAt", "updatedAt"
      FROM "PropertyFloor"
      WHERE "societyId" = ${societyId}::uuid AND "buildingId" = ${buildingId}::uuid
      ORDER BY "sortOrder" ASC, "name" ASC
    `);
  }

  async createFloor(societyId: string, buildingId: string, name: string, sortOrder = 0) {
    await this.assertBuilding(societyId, buildingId);
    const id = randomUUID();
    const normalizedName = name.trim();
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PropertyFloor" ("id", "societyId", "buildingId", "name", "sortOrder", "createdAt", "updatedAt")
      VALUES (${id}::uuid, ${societyId}::uuid, ${buildingId}::uuid, ${normalizedName}, ${sortOrder}, NOW(), NOW())
    `);
    const [created] = await this.prisma.$queryRaw<FloorRow[]>(Prisma.sql`
      SELECT "id", "societyId", "buildingId", "name", "sortOrder", "createdAt", "updatedAt"
      FROM "PropertyFloor" WHERE "id" = ${id}::uuid
    `);
    return created;
  }

  async createUnit(societyId: string, buildingId: string, number: string, floorId?: string) {
    await this.assertBuilding(societyId, buildingId);
    const floor = floorId ? await this.assertFloor(societyId, buildingId, floorId) : null;
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({ data: { societyId, buildingId, number: number.trim() } });
      if (floor) {
        await tx.$executeRaw(Prisma.sql`UPDATE "Unit" SET "floorId" = ${floor.id}::uuid WHERE "id" = ${unit.id}::uuid`);
      }
      return { ...unit, floor };
    });
  }

  async listUnits(societyId: string, buildingId: string) {
    await this.assertBuilding(societyId, buildingId);
    const units = await this.prisma.unit.findMany({ where: { societyId, buildingId }, orderBy: { number: 'asc' } });
    if (!units.length) return [];
    const links = await this.prisma.$queryRaw<UnitFloorLink[]>(Prisma.sql`
      SELECT "id", "floorId" FROM "Unit"
      WHERE "societyId" = ${societyId}::uuid AND "buildingId" = ${buildingId}::uuid
    `);
    const floorIds = [...new Set(links.map((link) => link.floorId).filter((value): value is string => !!value))];
    const floors = floorIds.length
      ? await this.prisma.$queryRaw<FloorRow[]>(Prisma.sql`
          SELECT "id", "societyId", "buildingId", "name", "sortOrder", "createdAt", "updatedAt"
          FROM "PropertyFloor" WHERE "id" IN (${Prisma.join(floorIds.map((id) => Prisma.sql`${id}::uuid`))})
        `)
      : [];
    const floorById = new Map(floors.map((floor) => [floor.id, floor]));
    const floorIdByUnit = new Map(links.map((link) => [link.id, link.floorId]));
    return units.map((unit) => ({
      ...unit,
      floor: floorIdByUnit.get(unit.id) ? floorById.get(floorIdByUnit.get(unit.id) as string) ?? null : null,
    }));
  }

  private async assertBuilding(societyId: string, buildingId: string) {
    const building = await this.prisma.building.findFirst({ where: { id: buildingId, societyId } });
    if (!building) throw new NotFoundException('Building not found in this society');
    return building;
  }

  private async assertFloor(societyId: string, buildingId: string, floorId: string) {
    const floors = await this.prisma.$queryRaw<FloorRow[]>(Prisma.sql`
      SELECT "id", "societyId", "buildingId", "name", "sortOrder", "createdAt", "updatedAt"
      FROM "PropertyFloor"
      WHERE "id" = ${floorId}::uuid AND "societyId" = ${societyId}::uuid AND "buildingId" = ${buildingId}::uuid
      LIMIT 1
    `);
    if (!floors[0]) throw new NotFoundException('Floor not found in this building');
    return floors[0];
  }
}
