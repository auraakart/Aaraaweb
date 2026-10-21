import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { HelpdeskPhotosService, MAX_HELPDESK_PHOTO_BYTES } from './helpdesk-photos.service';

class PhotoDto {
 @IsIn(['BEFORE','AFTER']) kind!:'BEFORE'|'AFTER';
 @IsString() @MinLength(8) @MaxLength(120) idempotencyKey!:string;
 @IsOptional() @IsString() @MaxLength(200) note?:string;
}
const photoUpload=()=>FileInterceptor('photo',{limits:{fileSize:MAX_HELPDESK_PHOTO_BYTES,files:1,fields:3,fieldSize:1024}});
const requirePhoto=(file?:{buffer:Buffer;mimetype:string})=>{if(!file||file.mimetype!=='image/png')throw new BadRequestException('Select a PNG photo');return file.buffer;};

@Controller('helpdesk')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.HELPDESK)
export class HelpdeskPhotosController {
 constructor(private readonly photos:HelpdeskPhotosService){}
 @Get(':ticketId/photos') @Header('Cache-Control','no-store') @RequiresPermissions(AppPermission.HELPDESK_READ_OWN)
 list(@CurrentTenant() societyId:string,@Req() req:AuthenticatedRequest,@Param('ticketId',ParseUUIDPipe) ticketId:string){return this.photos.list(societyId,req.auth!.userId,ticketId);}
 @Post(':ticketId/photos') @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN) @UseInterceptors(photoUpload())
 add(@CurrentTenant() societyId:string,@Req() req:AuthenticatedRequest,@Param('ticketId',ParseUUIDPipe) ticketId:string,@Body() dto:PhotoDto,@UploadedFile() file?:{buffer:Buffer;mimetype:string}){return this.photos.add(societyId,req.auth!.userId,ticketId,dto,requirePhoto(file));}
 @Get(':ticketId/photos/:photoId') @Header('Cache-Control','no-store') @Header('X-Content-Type-Options','nosniff') @RequiresPermissions(AppPermission.HELPDESK_READ_OWN)
 async read(@CurrentTenant() societyId:string,@Req() req:AuthenticatedRequest,@Param('ticketId',ParseUUIDPipe) ticketId:string,@Param('photoId',ParseUUIDPipe) photoId:string){return new StreamableFile(await this.photos.read(societyId,req.auth!.userId,ticketId,photoId),{type:'image/png',disposition:'inline'});}
 @Get('review/:ticketId/photos') @Header('Cache-Control','no-store') @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
 reviewList(@CurrentTenant() societyId:string,@Req() req:AuthenticatedRequest,@Param('ticketId',ParseUUIDPipe) ticketId:string){return this.photos.list(societyId,req.auth!.userId,ticketId,true);}
 @Post('review/:ticketId/photos') @RequiresPermissions(AppPermission.HELPDESK_REVIEW) @UseInterceptors(photoUpload())
 reviewAdd(@CurrentTenant() societyId:string,@Req() req:AuthenticatedRequest,@Param('ticketId',ParseUUIDPipe) ticketId:string,@Body() dto:PhotoDto,@UploadedFile() file?:{buffer:Buffer;mimetype:string}){return this.photos.add(societyId,req.auth!.userId,ticketId,dto,requirePhoto(file),true);}
 @Get('review/:ticketId/photos/:photoId') @Header('Cache-Control','no-store') @Header('X-Content-Type-Options','nosniff') @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
 async reviewRead(@CurrentTenant() societyId:string,@Req() req:AuthenticatedRequest,@Param('ticketId',ParseUUIDPipe) ticketId:string,@Param('photoId',ParseUUIDPipe) photoId:string){return new StreamableFile(await this.photos.read(societyId,req.auth!.userId,ticketId,photoId,true),{type:'image/png',disposition:'inline'});}
}
