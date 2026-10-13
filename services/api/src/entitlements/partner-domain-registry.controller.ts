import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PartnerDomainRegistryService } from './partner-domain-registry.service';

class DomainChallengeDto {
 @IsString() @MaxLength(253) hostname!:string;
 @IsUUID() idempotencyKey!:string;
}
@Controller('partners/:partnerId/domains')
@UseGuards(BearerGuard)
export class PartnerDomainRegistryController {
 constructor(private readonly domains:PartnerDomainRegistryService){}
 @Get() @Header('Cache-Control','no-store')
 list(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string){
   return this.domains.list(req.auth!.userId,partnerId);
 }
 @Post() @Header('Cache-Control','no-store')
 request(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Body() dto:DomainChallengeDto){
   return this.domains.request(req.auth!.userId,partnerId,dto);
 }
 @Post(':domainId/verify') @Header('Cache-Control','no-store')
 verify(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Param('domainId',ParseUUIDPipe) domainId:string){
   return this.domains.verify(req.auth!.userId,partnerId,domainId);
 }
 @Delete(':domainId') @Header('Cache-Control','no-store')
 revoke(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Param('domainId',ParseUUIDPipe) domainId:string){
   return this.domains.revoke(req.auth!.userId,partnerId,domainId);
 }
}
