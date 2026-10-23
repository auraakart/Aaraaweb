import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsString, IsUUID, Matches, Min } from 'class-validator';
import { PartnerApplicationService } from './partner-application.service';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AppRole } from '../auth/auth.types';
class ApplicationIdentity { @IsString() applicationId!:string; @IsIn(['RESIDENT','GUARD']) appRole!:'RESIDENT'|'GUARD'; @Matches(/^[0-9a-f]{64}$/) signerFingerprint!:string; }
class ScopeContext { @IsUUID() grantId!:string; @IsUUID() allocationId!:string; @IsUUID() idempotencyKey!:string; @IsInt() @Min(1) expectedGrantVersion!:number; @IsInt() @Min(1) expectedOwnershipVersion!:number; }
@Controller('partners/:partnerId/applications')
@UseGuards(PartnerBearerGuard)
export class PartnerApplicationController {
 constructor(private readonly applications:PartnerApplicationService){}
 @Get() @Header('Cache-Control','no-store')
 list(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) id:string){return this.applications.list(req.auth!.userId,id);}
 @Post() @Header('Cache-Control','no-store')
 create(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) id:string,@Body() input:ApplicationIdentity){return this.applications.register(req.auth!.userId,id,input);}
}
@Controller('licensing/societies/:societyId')
@UseGuards(BearerGuard,RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class ApplicationScopeController {
 constructor(private readonly applications:PartnerApplicationService){}
 @Get('partner-applications') @Header('Cache-Control','no-store')
 list(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string){return this.applications.societyScopes(req.auth!,societyId);}
 @Post('applications/:applicationId/scopes') @Header('Cache-Control','no-store')
 propose(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Param('applicationId',ParseUUIDPipe) appId:string,@Body() input:ScopeContext){return this.applications.proposeScope(req.auth!,societyId,appId,input);}
 @Post('applications/:applicationId/scopes/:scopeId/approve') @Header('Cache-Control','no-store')
 approve(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Param('applicationId',ParseUUIDPipe) appId:string,@Param('scopeId',ParseUUIDPipe) scopeId:string,@Body() input:ScopeContext){return this.applications.approveScope(req.auth!,societyId,appId,scopeId,input);}
 @Delete('applications/:applicationId/scopes/:scopeId') @Header('Cache-Control','no-store')
 revoke(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Param('applicationId',ParseUUIDPipe) appId:string,@Param('scopeId',ParseUUIDPipe) scopeId:string){return this.applications.revokeScope(req.auth!,societyId,appId,scopeId);}
}
