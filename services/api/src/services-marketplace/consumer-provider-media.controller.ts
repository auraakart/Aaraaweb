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

type ProviderMediaResponse = {
  status?: string;
  publicUrl?: string | null;
  [key: string]: unknown;
};

@Controller('provider/services/media')
@UseGuards(BearerGuard)
export class ConsumerProviderMediaController {
  constructor(private readonly media: ProviderMediaService) {}

  @Get()
  async list(@CurrentProviderMediaUser() userId: string) {
    const items = await this.media.listMyMedia(this.requireUser(userId));
    return items.map((item) => this.forProvider(item));
  }

  @Post('uploads')
  async createUploadIntent(
    @CurrentProviderMediaUser() userId: string,
    @Body() dto: CreateProviderMediaUploadDto,
  ) {
    const result = await this.media.createMyUploadIntent(this.requireUser(userId), dto);
    const { storageKey: _storageKey, publicUrl: _publicUrl, ...upload } = result.upload;
    void _storageKey;
    void _publicUrl;
    return { media: this.forProvider(result.media), upload };
  }

  @Post(':mediaId/confirm')
  async confirmUpload(
    @CurrentProviderMediaUser() userId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    const item = await this.media.confirmMyUpload(this.requireUser(userId), mediaId);
    return this.forProvider(item);
  }

  @Delete(':mediaId')
  remove(
    @CurrentProviderMediaUser() userId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.removeMyMedia(this.requireUser(userId), mediaId);
  }

  private forProvider<T extends ProviderMediaResponse>(item: T): T {
    if (item.status === 'APPROVED') return item;
    return { ...item, publicUrl: null };
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
