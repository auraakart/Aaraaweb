import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { DocumentsStorageService } from './documents-storage.service';
import { DocumentsService } from './documents.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class DocumentUploadIntentDto {
  @IsString() @MaxLength(120) contentType!: string;
  @IsInt() @Min(1) @Max(5 * 1024 * 1024) contentLengthBytes!: number;
}

class CreateDocumentDto {
  @IsOptional() @IsUUID() unitId?: string;
  @IsIn(['BYLAW','POLICY','MEETING_MINUTES','CIRCULAR','COMPLIANCE','CONTRACT','AMC','FINANCE','PROPERTY','OTHER']) category!: string;
  @IsIn(['MANAGEMENT','ALL_MEMBERS','OWNERS_ONLY','PROPERTY_OWNER_ONLY']) audience!: 'MANAGEMENT' | 'ALL_MEMBERS' | 'OWNERS_ONLY' | 'PROPERTY_OWNER_ONLY';
  @IsString() @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @MaxLength(500) storageKey!: string;
  @IsString() @MaxLength(255) fileName!: string;
  @IsString() @MaxLength(120) mimeType!: string;
  @IsInt() @Min(1) @Max(5 * 1024 * 1024) sizeBytes!: number;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

@Controller('documents')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storage: DocumentsStorageService,
  ) {}

  @Get('published')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  published(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.documents.listPublishedForUser(societyId, this.requireUser(userId));
  }

  @Get('published/:documentId/download-intent')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  async publishedDownload(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    const document = await this.documents.getPublishedDocumentForUser(societyId, this.requireUser(userId), documentId);
    return this.storage.createDownloadIntent(societyId, document.storageKey);
  }

  @Get('management/context')
  @RequiresPermissions(AppPermission.DOCUMENTS_READ)
  managementContext(@CurrentTenant() societyId: string) {
    return this.documents.managementContext(societyId);
  }

  @Get('management')
  @RequiresPermissions(AppPermission.DOCUMENTS_READ)
  management(@CurrentTenant() societyId: string) {
    return this.documents.listManagement(societyId);
  }

  @Post('management/upload-intent')
  @RequiresPermissions(AppPermission.DOCUMENTS_MANAGE)
  uploadIntent(@CurrentTenant() societyId: string, @Body() dto: DocumentUploadIntentDto) {
    return this.storage.createUploadIntent(societyId, dto);
  }

  @Post('management')
  @RequiresPermissions(AppPermission.DOCUMENTS_MANAGE)
  async create(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Body() dto: CreateDocumentDto,
  ) {
    await this.storage.verifyAndScanUpload(societyId, {
      storageKey: dto.storageKey,
      contentType: dto.mimeType,
      contentLengthBytes: dto.sizeBytes,
    });
    return this.documents.createDraft(societyId, this.requireUser(userId), dto);
  }

  @Get('management/:documentId/download-intent')
  @RequiresPermissions(AppPermission.DOCUMENTS_READ)
  async managementDownload(@CurrentTenant() societyId: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    const document = await this.documents.getManagementDocument(societyId, documentId);
    return this.storage.createDownloadIntent(societyId, document.storageKey);
  }

  @Patch('management/:documentId/publish')
  @RequiresPermissions(AppPermission.DOCUMENTS_MANAGE)
  publish(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.documents.publish(societyId, this.requireUser(userId), documentId);
  }

  @Patch('management/:documentId/archive')
  @RequiresPermissions(AppPermission.DOCUMENTS_MANAGE)
  archive(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.documents.archive(societyId, this.requireUser(userId), documentId);
  }

  @Get('management/:documentId/history')
  @RequiresPermissions(AppPermission.DOCUMENTS_READ)
  history(@CurrentTenant() societyId: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.documents.history(societyId, documentId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
