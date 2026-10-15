import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ProviderTrustReviewService, ReviewedProviderQualityTier } from './provider-trust-review.service';

const CurrentPlatformUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class ReviewTrustDto{@IsIn(['STANDARD','TRUSTED','PREMIUM']) qualityTier!:ReviewedProviderQualityTier;@IsString() @MinLength(1) @MaxLength(1000) note!:string;}

@Controller('platform/services/provider-trust')
@UseGuards(BearerGuard,PermissionsGuard)
export class ProviderTrustReviewController{
  constructor(private readonly trust:ProviderTrustReviewService){}
  @Get('recommendations') @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY) list(){return this.trust.listRecommendations();}
  @Get('providers/:providerId') @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY) get(@Param('providerId',ParseUUIDPipe) providerId:string){return this.trust.get(providerId);}
  @Patch('providers/:providerId') @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY) review(@CurrentPlatformUser() userId:string|undefined,@Param('providerId',ParseUUIDPipe) providerId:string,@Body() dto:ReviewTrustDto){if(!userId)throw new UnauthorizedException('Authentication required');return this.trust.setReviewedTier(providerId,userId,dto.qualityTier,dto.note);}
}
