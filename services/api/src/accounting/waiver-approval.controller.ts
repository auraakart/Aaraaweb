import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WaiverApprovalService } from './waiver-approval.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateWaiverRequestDto {
  @IsUUID() receivableId!:string;
  @IsInt() @Min(1) amountPaise!:number;
  @IsString() @MinLength(1) @MaxLength(500) reason!:string;
  @IsDateString() entryDate!:string;
  @IsString() @MinLength(1) @MaxLength(60) journalEntryNumber!:string;
  @IsString() @MinLength(1) @MaxLength(120) requestKey!:string;
}
class ReviewWaiverDto { @IsOptional() @IsString() @MaxLength(500) reason?:string; }

@Controller('accounting/waivers')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class WaiverApprovalController {
  constructor(private readonly waivers:WaiverApprovalService) {}
  @Get('requests') @RequiresPermissions(AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId:string){return this.waivers.list(societyId);}
  @Post('requests') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  request(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateWaiverRequestDto){return this.waivers.request(societyId,this.user(userId),dto);}
  @Post('requests/:id/approve') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  approve(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.waivers.approve(societyId,this.user(userId),id);}
  @Post('requests/:id/reject') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  reject(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ReviewWaiverDto){return this.waivers.reject(societyId,this.user(userId),id,dto);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
