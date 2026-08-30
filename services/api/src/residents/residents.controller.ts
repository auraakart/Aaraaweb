import { Body, Controller, Get, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { UnitRelation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BearerGuard } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';

class LinkResidentDto {
  @IsUUID() userId!: string;
  @IsUUID() unitId!: string;
  @IsEnum(UnitRelation) relation!: UnitRelation;
}
class CreateResidentDto {
  @IsString() @IsNotEmpty() phone!: string;
  @IsString() @IsNotEmpty() name!: string;
}

@Controller('residents')
@UseGuards(BearerGuard, TenantGuard)
export class ResidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() societyId: string) {
    return this.prisma.unitResident.findMany({ where: { societyId, active: true }, include: { user: true, unit: { include: { building: true } } }, orderBy: { createdAt: 'desc' } });
  }

  @Post()
  create(@Body() dto: CreateResidentDto) {
    return this.prisma.user.upsert({ where: { phone: dto.phone.trim() }, update: { name: dto.name.trim() }, create: { phone: dto.phone.trim(), name: dto.name.trim() } });
  }

  @Post('link')
  async link(@Body() dto: LinkResidentDto, @CurrentTenant() societyId: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, building: { societyId } } });
    if (!unit) throw new BadRequestException('Unit does not belong to authenticated society');
    return this.prisma.unitResident.upsert({
      where: { unitId_userId: { unitId: dto.unitId, userId: dto.userId } },
      update: { societyId, relation: dto.relation, active: true },
      create: { societyId, unitId: dto.unitId, userId: dto.userId, relation: dto.relation },
      include: { user: true, unit: { include: { building: true } } },
    });
  }
}
