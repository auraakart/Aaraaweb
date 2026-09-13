import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { Prisma } from '@prisma/client';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

class AssetStatusDto {
  @IsIn(['ACTIVE','OUT_OF_SERVICE','RETIRED'])
  status!: 'ACTIVE'|'OUT_OF_SERVICE'|'RETIRED';
}

@Controller('facilities/assets')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesAssetsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':id/status')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setStatus(
    @CurrentTenant() societyId:string,
    @Param('id',new ParseUUIDPipe()) id:string,
    @Body() dto:AssetStatusDto,
  ) {
    const rows=await this.prisma.$queryRaw<Array<{status:string}>>(Prisma.sql`
      SELECT "status" FROM "FacilityAsset"
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid
      FOR UPDATE
    `);
    if(!rows.length)throw new BadRequestException('Facility asset not found');
    const current=rows[0].status;
    if(current==='RETIRED'&&dto.status!=='RETIRED')throw new BadRequestException('Retired facility assets cannot be reactivated');
    if(current===dto.status)return this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "FacilityAsset" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    const updated=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "FacilityAsset"
      SET "status"=${dto.status},"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid
      RETURNING *
    `);
    return updated[0];
  }
}
