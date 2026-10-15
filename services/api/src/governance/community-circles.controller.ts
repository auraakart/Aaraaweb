import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsISO8601, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { CommunityCirclesService } from './community-circles.service';

const CurrentUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateCommunityCircleDto{
  @IsString() @MinLength(3) @MaxLength(80) name!:string;
  @IsOptional() @IsString() @MaxLength(500) description?:string;
  @IsOptional() @IsISO8601() expiresAt?:string|null;
}

class CommunityCircleStatusDto{
  @IsIn(['ACTIVE','CLOSED']) status!:'ACTIVE'|'CLOSED';
}

export class CommunityCirclePostDto{
  @IsString() @MinLength(1) @MaxLength(1000) body!:string;
}

class CircleReviewDto {
 @IsIn(['APPROVE','REJECT']) decision!:'APPROVE'|'REJECT';
 @IsString() @MinLength(3) @MaxLength(500) reason!:string;
}
class CircleExpiryDto { @IsOptional() @IsISO8601() expiresAt?:string|null; }
class CircleReportDto { @IsString() @MinLength(3) @MaxLength(500) reason!:string; }
class CircleModerationDto extends CircleReportDto { @IsBoolean() hidden!:boolean; }
export class RequestCircleDto {
 @IsString() @MinLength(3) @MaxLength(80) name!:string;
 @IsOptional() @IsString() @MaxLength(500) description?:string;
}

@Controller('community-circles')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
export class CommunityCirclesController{
  constructor(private readonly circles:CommunityCirclesService){}

  @Get()
  @RequiresPermissions(AppPermission.NOTICE_READ)
  list(@CurrentTenant() societyId:string,@CurrentUser() userId?:string){
    return this.circles.listVisible(societyId,this.user(userId));
  }

  @Get('manage')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  manage(@CurrentTenant() societyId:string){
    return this.circles.listManage(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateCommunityCircleDto){
    return this.circles.create(societyId,this.user(userId),dto.name,dto.description,dto.expiresAt);
  }

  @Post(':id/status')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  status(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CommunityCircleStatusDto){
    return this.circles.setStatus(societyId,id,dto.status);
  }

  @Post(':id/join')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  join(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.circles.join(societyId,this.user(userId),id);
  }

  @Post(':id/leave')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  leave(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.circles.leave(societyId,this.user(userId),id);
  }

  @Get(':id/posts')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  posts(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.circles.listPosts(societyId,this.user(userId),id);
  }

  @Post(':id/posts')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  post(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CommunityCirclePostDto){
    return this.circles.createPost(societyId,this.user(userId),id,dto.body);
  }

  @Get('requests/mine')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  myRequests(@CurrentTenant() societyId:string,@CurrentUser() userId?:string){return this.circles.myRequests(societyId,this.user(userId));}

  @Post('requests')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  request(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:RequestCircleDto){return this.circles.request(societyId,this.user(userId),dto.name,dto.description);}

  @Post(':id/review')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  review(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CircleReviewDto){return this.circles.review(societyId,id,this.user(userId),dto.decision,dto.reason);}

  @Post(':id/expiry')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  expiry(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CircleExpiryDto){
    if(dto.expiresAt===undefined)throw new BadRequestException('Provide a deletion date or null to clear it');
    return this.circles.setExpiry(societyId,id,dto.expiresAt);
  }

  @Post(':id/posts/:postId/report')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  report(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('postId',new ParseUUIDPipe()) postId:string,@Body() dto:CircleReportDto){return this.circles.report(societyId,this.user(userId),id,postId,dto.reason);}

  @Get('reports/manage')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  reports(@CurrentTenant() societyId:string){return this.circles.listReports(societyId);}

  @Post(':id/posts/:postId/moderate')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  moderate(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('postId',new ParseUUIDPipe()) postId:string,@Body() dto:CircleModerationDto){return this.circles.moderate(societyId,id,postId,this.user(userId),dto.hidden,dto.reason);}

  private user(userId?:string){
    if(!userId)throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
