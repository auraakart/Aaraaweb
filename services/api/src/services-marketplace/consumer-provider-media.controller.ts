import {
  Body,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ProviderMediaKind, ProviderMediaService } from './provider-media.service';

const CurrentProviderMediaUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class CreateProviderMediaUploadDto {
  @IsIn(['LOGO', 'GALLERY'])
  kind!: ProviderMediaKind;

  @IsString()
  @MaxLength(80)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  contentLengthBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  originalFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  altText?: string;
}

@Controller('provider/services/media')
@UseGuards(BearerGuard)
export class ConsumerProviderMediaController {
  constructor(private readonly media: ProviderMediaService) {}

  @Get()
  list(@CurrentProviderMediaUser() userId: string) {
    return this.media.listMyMedia(this.requireUser(userId));
  }

  @Post('uploads')
  createUploadIntent(
    @CurrentProviderMediaUser() userId: string,
    @Body() dto: CreateProviderMediaUploadDto,
  ) {
    return this.media.createMyUploadIntent(this.requireUser(userId), dto);
  }

  @Post(':mediaId/confirm')
  confirmUpload(
    @CurrentProviderMediaUser() userId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.confirmMyUpload(this.requireUser(userId), mediaId);
  }

  @Delete(':mediaId')
  remove(
    @CurrentProviderMediaUser() userId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.removeMyMedia(this.requireUser(userId), mediaId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
