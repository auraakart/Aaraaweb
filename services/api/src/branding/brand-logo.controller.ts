import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsIn, Max, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { BrandLogoService } from './brand-logo.service';

class SocietyLogoUploadDto {
  @IsIn(['image/png']) contentType!: string;
  @IsInt() @Min(57) @Max(512 * 1024) contentLengthBytes!: number;
}

@Controller('branding/manage/logos')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
@RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
export class BrandLogoController {
  constructor(private readonly service: BrandLogoService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.auth!.societyId!, req.auth!.userId);
  }

  @Post('uploads')
  @Header('Cache-Control', 'no-store')
  upload(@Req() req: AuthenticatedRequest, @Body() input: SocietyLogoUploadDto) {
    return this.service.createUpload(req.auth!.societyId!, req.auth!.userId, input);
  }

  @Post(':assetId/cancel')
  @Header('Cache-Control', 'no-store')
  cancel(@Req() req: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.service.cancelUpload(req.auth!.societyId!, req.auth!.userId, id);
  }

  @Post(':assetId/confirm')
  @Header('Cache-Control', 'no-store')
  confirm(@Req() req: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.service.confirmUpload(req.auth!.societyId!, req.auth!.userId, id);
  }
}
