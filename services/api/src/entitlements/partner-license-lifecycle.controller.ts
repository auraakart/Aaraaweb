import { Body, Controller, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayUnique, Equals, IsArray, IsEnum, IsIn, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { PartnerLicenseLifecycleService } from './partner-license-lifecycle.service';
class LicenseContextDto {
 @IsUUID() grantId!:string;
 @IsInt() @Min(1) @Max(2147483647) expectedGrantVersion!:number;
 @IsInt() @Min(1) @Max(2147483647) expectedOwnershipVersion!:number;
 @IsUUID() idempotencyKey!:string;
}
class ApprovalDto extends LicenseContextDto {
 @IsString() @MinLength(3) @MaxLength(500) reason!:string;
 @Equals('PRESERVE_LEGACY') essentialPolicy!:'PRESERVE_LEGACY';
}
class RevocationDto extends LicenseContextDto { @IsString() @MinLength(3) @MaxLength(500) reason!:string }
class ConsentDto extends LicenseContextDto {
 @IsIn(['OPT_IN','WITHDRAW']) decision!:'OPT_IN'|'WITHDRAW';
 @IsArray() @ArrayUnique() @IsEnum(ProductFeature,{each:true}) expectedFeatures!:ProductFeature[];
}
class AllocationDto extends LicenseContextDto { @IsUUID() consentId!:string }
@Controller('licensing/societies/:societyId')
@UseGuards(BearerGuard,RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class PartnerLicenseLifecycleController {
 constructor(private readonly licenses:PartnerLicenseLifecycleService) {}
 @Post('approvals') @Header('Cache-Control','no-store')
 approve(@Req() request:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Body() dto:ApprovalDto){return this.licenses.approve(request.auth!,societyId,dto);}
 @Post('revocations') @Header('Cache-Control','no-store')
 revoke(@Req() request:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Body() dto:RevocationDto){return this.licenses.revoke(request.auth!,societyId,dto);}
 @Post('consents') @Roles(AppRole.SOCIETY_ADMIN,AppRole.SUPER_ADMIN) @Header('Cache-Control','no-store')
 consent(@Req() request:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Body() dto:ConsentDto){return this.licenses.consent(request.auth!,societyId,dto);}
 @Post('allocations') @Header('Cache-Control','no-store')
 activate(@Req() request:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Body() dto:AllocationDto){return this.licenses.activate(request.auth!,societyId,dto);}
}
