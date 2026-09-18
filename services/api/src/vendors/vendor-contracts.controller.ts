import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { VendorContractsService } from './vendor-contracts.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateVendorContractDto{
 @IsUUID() vendorId!:string;
 @IsString() @MaxLength(120) contractNumber!:string;
 @IsString() @MaxLength(240) title!:string;
 @IsIn(['AMC','SERVICE_AGREEMENT','SUPPLY','OTHER']) contractType!:'AMC'|'SERVICE_AGREEMENT'|'SUPPLY'|'OTHER';
 @IsDateString() startsOn!:string;
 @IsDateString() endsOn!:string;
 @IsInt() @Min(0) @Max(3650) renewalNoticeDays!:number;
 @IsOptional() @IsString() @MaxLength(1000) slaReference?:string;
 @IsOptional() @IsString() @MaxLength(1000) documentReference?:string;
 @IsOptional() @IsString() @MaxLength(2000) notes?:string;
}
class UpdateVendorContractStatusDto{
 @IsIn(['ACTIVE','EXPIRED','TERMINATED']) status!:'ACTIVE'|'EXPIRED'|'TERMINATED';
 @IsOptional() @IsString() @MaxLength(1000) note?:string;
}

@Controller('society-vendors/contracts')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class VendorContractsController{
 constructor(private readonly contracts:VendorContractsService){}
 @Get() @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ)
 list(@CurrentTenant() societyId:string){return this.contracts.listContracts(societyId);}
 @Post() @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
 create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateVendorContractDto){return this.contracts.createContract(societyId,this.user(userId),dto);}
 @Patch(':contractId/status') @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
 status(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('contractId',ParseUUIDPipe) contractId:string,@Body() dto:UpdateVendorContractStatusDto){return this.contracts.updateStatus(societyId,this.user(userId),contractId,dto.status,dto.note);}
 private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
