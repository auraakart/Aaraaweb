import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ParcelRecipientsService } from './parcel-recipients.service';
import { ParcelReminderService } from './parcel-reminder.service';
import { ParcelsService } from './parcels.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class IntakeParcelDto {
  @IsUUID() unitId!: string;
  @IsUUID() recipientUserId!: string;
  @IsOptional() @IsString() @MaxLength(120) courierName?: string;
  @IsOptional() @IsString() @MaxLength(160) trackingReference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class ReturnParcelDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

class ParcelPickupCodeDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

@Controller('parcels')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ParcelsController {
  constructor(
    private readonly parcels: ParcelsService,
    private readonly reminders: ParcelReminderService,
    private readonly recipients: ParcelRecipientsService,
  ) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.PARCEL_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.parcels.listOwn(societyId, this.requireUser(userId));
  }

  @Post('mine/:parcelId/pickup-code')
  @RequiresPermissions(AppPermission.PARCEL_READ_OWN)
  pickupCode(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('parcelId', ParseUUIDPipe) parcelId: string) {
    return this.parcels.issuePickupCode(societyId, this.requireUser(userId), parcelId);
  }

  @Patch('mine/:parcelId/collect')
  @RequiresPermissions(AppPermission.PARCEL_READ_OWN)
  collect(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('parcelId', ParseUUIDPipe) parcelId: string) {
    return this.parcels.confirmCollection(societyId, this.requireUser(userId), parcelId);
  }

  @Get('desk')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  desk(@CurrentTenant() societyId: string) {
    return this.parcels.listDesk(societyId);
  }

  @Get('desk/recipients')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  deskRecipients(@CurrentTenant() societyId: string) {
    return this.recipients.list(societyId);
  }

  @Post('desk')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  intake(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Body() dto: IntakeParcelDto) {
    return this.parcels.intake(societyId, this.requireUser(userId), dto);
  }

  @Post('desk/:parcelId/remind')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  remind(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('parcelId', ParseUUIDPipe) parcelId: string) {
    return this.reminders.remind(societyId, this.requireUser(userId), parcelId);
  }

  @Patch('desk/:parcelId/collect-with-code')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  collectWithCode(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() dto: ParcelPickupCodeDto,
  ) {
    return this.parcels.collectWithPickupCode(societyId, this.requireUser(userId), parcelId, dto.code);
  }

  @Patch('desk/:parcelId/return')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  returnToSender(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('parcelId', ParseUUIDPipe) parcelId: string, @Body() dto: ReturnParcelDto) {
    return this.parcels.returnToSender(societyId, this.requireUser(userId), parcelId, dto.reason);
  }

  @Get('desk/:parcelId/history')
  @RequiresPermissions(AppPermission.PARCEL_PROCESS)
  history(@CurrentTenant() societyId: string, @Param('parcelId', ParseUUIDPipe) parcelId: string) {
    return this.parcels.history(societyId, parcelId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
