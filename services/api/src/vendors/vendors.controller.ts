import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { VendorsService } from './vendors.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateVendorDto {
  @IsString() @MaxLength(64) code!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(120) category!: string;
  @IsOptional() @IsString() @MaxLength(160) contactName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(32) gstin?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class VendorStatusDto {
  @IsIn(['ACTIVE','SUSPENDED','ARCHIVED']) status!: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}

class CreateProcurementRequestDto {
  @IsString() @MaxLength(64) requestNumber!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsInt() @Min(0) estimatedAmountPaise!: number;
  @IsOptional() @IsUUID() preferredVendorId?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceType?: string;
  @IsOptional() @IsUUID() sourceId?: string;
}

class ProcurementActionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('society-vendors')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ)
  listVendors(@CurrentTenant() societyId: string) {
    return this.vendors.listVendors(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  createVendor(@Body() dto: CreateVendorDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.vendors.createVendor(societyId, this.requireUser(userId), dto);
  }

  @Patch(':vendorId/status')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  updateVendorStatus(@Param('vendorId', ParseUUIDPipe) vendorId: string, @Body() dto: VendorStatusDto, @CurrentTenant() societyId: string) {
    return this.vendors.updateVendorStatus(societyId, vendorId, dto.status);
  }

  @Get('procurement/requests')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ)
  listRequests(@CurrentTenant() societyId: string) {
    return this.vendors.listRequests(societyId);
  }

  @Post('procurement/requests')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  createRequest(@Body() dto: CreateProcurementRequestDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.vendors.createRequest(societyId, this.requireUser(userId), dto);
  }

  @Patch('procurement/requests/:requestId/submit')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  submit(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: ProcurementActionDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.vendors.submitRequest(societyId, this.requireUser(userId), requestId, dto.note);
  }

  @Patch('procurement/requests/:requestId/approve')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  approve(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: ProcurementActionDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.vendors.approveRequest(societyId, this.requireUser(userId), requestId, dto.note);
  }

  @Patch('procurement/requests/:requestId/reject')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  reject(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: ProcurementActionDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.vendors.rejectRequest(societyId, this.requireUser(userId), requestId, dto.note);
  }

  @Get('procurement/requests/:requestId/history')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ)
  history(@Param('requestId', ParseUUIDPipe) requestId: string, @CurrentTenant() societyId: string) {
    return this.vendors.history(societyId, requestId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
