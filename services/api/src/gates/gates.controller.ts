import { Body, Controller, Get, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { BearerGuard } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';

class CreateGateDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('gates')
@UseGuards(BearerGuard, TenantGuard)
export class GatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() societyId: string) {
    return this.prisma.gate.findMany({ where: { societyId }, orderBy: { name: 'asc' } });
  }

  @Post()
  async create(@Body() dto: CreateGateDto, @CurrentTenant() societyId: string) {
    const existing = await this.prisma.gate.findFirst({ where: { societyId, code: dto.code.trim() } });
    if (existing) throw new BadRequestException('Gate code already exists in this society');
    return this.prisma.gate.create({ data: { societyId, name: dto.name.trim(), code: dto.code.trim(), active: dto.active ?? true } });
  }
}
