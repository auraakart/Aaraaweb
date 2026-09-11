import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  ProviderMediaReviewDecision,
  ProviderMediaService,
  ProviderMediaStatus,
} from './provider-media.service';

const CurrentMediaModerator = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ProviderMediaModerationQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'REMOVED'])
  status?: ProviderMediaStatus;
}

class ReviewProviderMediaDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: ProviderMediaReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('platform/services/provider-media')
@UseGuards(BearerGuard, PermissionsGuard)
@RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
export class ProviderMediaPlatformController {
  constructor(private readonly media: ProviderMediaService) {}

  @Get()
  list(@Query() query: ProviderMediaModerationQueryDto) {
    return this.media.listForModeration(query.status ?? 'PENDING');
  }

  @Patch(':mediaId/review')
  review(
    @CurrentMediaModerator() actorUserId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: ReviewProviderMediaDto,
  ) {
    if (!actorUserId) throw new UnauthorizedException('Authentication required');
    return this.media.reviewMedia(actorUserId, mediaId, dto.decision, dto.note);
  }
}
