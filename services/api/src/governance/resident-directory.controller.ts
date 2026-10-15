import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ResidentDirectoryService } from './resident-directory.service';

const CurrentUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class DirectoryProfileDto{
  @IsBoolean() visible!:boolean;
  @IsOptional() @IsString() @MaxLength(80) displayName?:string;
  @IsOptional() @IsString() @MaxLength(280) bio?:string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({each:true}) @MaxLength(40,{each:true}) interests?:string[];
}
class ContactRequestDto{@IsOptional() @IsString() @MaxLength(500) message?:string;}
class ContactResponseDto{
  @IsIn(['ACCEPTED','DECLINED']) status!:'ACCEPTED'|'DECLINED';
  @IsOptional() @IsString() @MaxLength(500) responseNote?:string;
}

@Controller('resident-directory')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
@RequiresPermissions(AppPermission.NOTICE_READ)
export class ResidentDirectoryController{
  constructor(private readonly directory:ResidentDirectoryService){}

  @Get()
  list(@CurrentTenant() societyId:string,@CurrentUser() userId?:string){
    return this.directory.listVisible(societyId,this.user(userId));
  }

  @Get('mine')
  mine(@CurrentTenant() societyId:string,@CurrentUser() userId?:string){
    return this.directory.mine(societyId,this.user(userId));
  }

  @Put('mine')
  updateMine(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:DirectoryProfileDto){
    return this.directory.updateMine(societyId,this.user(userId),dto);
  }

  @Get('contact-requests/mine')
  requests(@CurrentTenant() societyId:string,@CurrentUser() userId?:string){
    return this.directory.contactRequests(societyId,this.user(userId));
  }

  @Post(':userId/contact-requests')
  request(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('userId',new ParseUUIDPipe()) recipientUserId:string,@Body() dto:ContactRequestDto){
    return this.directory.requestContact(societyId,this.user(userId),recipientUserId,dto.message);
  }

  @Post('contact-requests/:id/respond')
  respond(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) requestId:string,@Body() dto:ContactResponseDto){
    return this.directory.respond(societyId,this.user(userId),requestId,dto.status,dto.responseNote);
  }

  @Post('contact-requests/:id/withdraw')
  withdraw(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) requestId:string){
    return this.directory.withdraw(societyId,this.user(userId),requestId);
  }

  private user(userId?:string){
    if(!userId)throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
