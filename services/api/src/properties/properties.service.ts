import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    return this.prisma.building.create({ data: { societyId, name, code } });
  }

  async createUnit(societyId: string, buildingId: string, number: string) {
    const building = await this.prisma.building.findFirst({ where: { id: buildingId, societyId } });
    if (!building) throw new NotFoundException('Building not found in this society');
    return this.prisma.unit.create({ data: { societyId, buildingId, number } });
  }

  async listUnits(societyId: string, buildingId: string) {
    const building = await this.prisma.building.findFirst({ where: { id: buildingId, societyId } });
    if (!building) throw new NotFoundException('Building not found in this society');
    return this.prisma.unit.findMany({ where: { societyId, buildingId }, orderBy: { number: 'asc' } });
  }
}
