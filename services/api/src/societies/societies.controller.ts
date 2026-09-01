import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateSocietyDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 32)
  code!: string;
}

@Controller('societies')
export class SocietiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(BearerGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  list() {
    return this.prisma.society.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentTenant() societyId: string) {
    if (id !== societyId) throw new ForbiddenException('Society path does not match authenticated tenant');
    return this.prisma.society.findUniqueOrThrow({
      where: { id: societyId },
      include: { buildings: true, gates: true },
    });
  }

  @Post()
  @UseGuards(BearerGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  create(@Body() dto: CreateSocietyDto) {
    return this.prisma.society.create({ data: { name: dto.name.trim(), code: dto.code.trim().toUpperCase() } });
  }
}
