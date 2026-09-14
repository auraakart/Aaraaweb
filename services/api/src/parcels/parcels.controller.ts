import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ParcelsService } from './parcels.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class ReceiveParcelDto {
  @IsUUID() unitId!: string;
  @IsOptional() @IsString() @MaxLength(120) carrier?: string;
  @IsOptional() @IsString() @MaxLength(180) trackingReference?: string;
  @IsOptional() @IsString() @MaxLength(160) recipientName?: string;
  @IsOptional() @IsIn(['PACKAGE','DOCUMENT','FOOD','OTHER']) packageType?: 'PACKAGE' | 'DOCUMENT' | 'FOOD' | 'OTHER';
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class CollectParcelDto {
  @IsUUID() collectorUserId!: string;
}

class ReturnParcelDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller('parcels')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  @Get()
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.parcels.listMine(societyId, this.requireUser(userId));
  }

  @Patch(':parcelId/read')
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  read(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
  ) {
    return this.parcels.markRead(societyId, this.requireUser(userId), parcelId);
  }

  @Get('desk')
  @RequiresPermissions(AppPermission.GATE_READ)
  desk(
    @CurrentTenant() societyId: string,
    @Query('status') status?: 'RECEIVED' | 'COLLECTED' | 'RETURNED',
  ) {
    if (status && !['RECEIVED','COLLECTED','RETURNED'].includes(status)) throw new BadRequestException('Invalid parcel status');
    return this.parcels.listDesk(societyId, status);
  }

  @Post('desk')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  receive(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Body() dto: ReceiveParcelDto,
  ) {
    return this.parcels.receive(societyId, this.requireUser(userId), dto);
  }

  @Patch('desk/:parcelId/collect')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  collect(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() dto: CollectParcelDto,
  ) {
    return this.parcels.collect(societyId, this.requireUser(userId), parcelId, dto.collectorUserId);
  }

  @Patch('desk/:parcelId/return')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  returnParcel(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() dto: ReturnParcelDto,
  ) {
    return this.parcels.returnParcel(societyId, this.requireUser(userId), parcelId, dto.note);
  }

  @Get('desk/:parcelId/history')
  @RequiresPermissions(AppPermission.GATE_READ)
  history(@CurrentTenant() societyId: string, @Param('parcelId', ParseUUIDPipe) parcelId: string) {
    return this.parcels.history(societyId, parcelId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
