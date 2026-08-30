import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { UnitRelation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

class LinkResidentDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  societyId!: string;

  @IsUUID()
  unitId!: string;

  @IsEnum(UnitRelation)
  relation!: UnitRelation;
}

class CreateResidentDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

@Controller('residents')
export class ResidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('society/:societyId')
  list(@Param('societyId') societyId: string) {
    return this.prisma.unitResident.findMany({
      where: { societyId, active: true },
      include: { user: true, unit: { include: { building: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateResidentDto) {
    return this.prisma.user.upsert({
      where: { phone: dto.phone.trim() },
      update: { name: dto.name.trim() },
      create: { phone: dto.phone.trim(), name: dto.name.trim() },
    });
  }

  @Post('link')
  link(@Body() dto: LinkResidentDto) {
    return this.prisma.unitResident.upsert({
      where: { unitId_userId: { unitId: dto.unitId, userId: dto.userId } },
      update: { societyId: dto.societyId, relation: dto.relation, active: true },
      create: { societyId: dto.societyId, unitId: dto.unitId, userId: dto.userId, relation: dto.relation },
      include: { user: true, unit: { include: { building: true } } },
    });
  }
}
