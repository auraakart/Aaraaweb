import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsString, Length, Min } from 'class-validator';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { PartnerBrandService } from './partner-brand.service';
class BrandDraft { @IsInt() @Min(0) expectedVersion!: number; @IsObject() config!: Record<string, unknown>; }
class PublishBrand { @IsInt() @Min(0) expectedPublishedVersion!: number; @IsString() @Length(3,500) reason!: string; }
@Controller('partners/:partnerId/branding')
@UseGuards(PartnerBearerGuard)
export class PartnerBrandController {
 constructor(private readonly brands: PartnerBrandService) {}
 @Get() @Header('Cache-Control','no-store')
 history(@Req() req: AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string) { return this.brands.history(req.auth!.userId,partnerId); }
 @Post('drafts') @Header('Cache-Control','no-store')
 draft(@Req() req: AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Body() input:BrandDraft) { return this.brands.draft(req.auth!.userId,partnerId,input.expectedVersion,input.config); }
 @Post('drafts/:revisionId/publish') @Header('Cache-Control','no-store')
 publish(@Req() req: AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Param('revisionId',ParseUUIDPipe) revisionId:string,@Body() input:PublishBrand) { return this.brands.publish(req.auth!.userId,partnerId,revisionId,input.expectedPublishedVersion,input.reason); }
}
