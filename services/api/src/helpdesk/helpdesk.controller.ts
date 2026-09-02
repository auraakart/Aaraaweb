import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { HelpdeskService } from './helpdesk.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateHelpdeskTicketDto {
  @IsUUID() unitId!: string;
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsString() @MinLength(5) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

class AddHelpdeskCommentDto {
  @IsString() @MinLength(1) @MaxLength(1000) message!: string;
}

class UpdateHelpdeskStatusDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status!: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('helpdesk')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.HELPDESK)
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskService) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.HELPDESK_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.helpdesk.listMine(societyId, this.requireUser(userId));
  }

  @Post()
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  create(@Body() dto: CreateHelpdeskTicketDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.helpdesk.createMine(societyId, this.requireUser(userId), dto);
  }

  @Post(':ticketId/comments')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  comment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: AddHelpdeskCommentDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.helpdesk.addComment(societyId, this.requireUser(userId), ticketId, dto.message);
  }

  @Get(':ticketId/activities')
  @RequiresPermissions(AppPermission.HELPDESK_READ_OWN)
  activities(@Param('ticketId', ParseUUIDPipe) ticketId: string, @CurrentTenant() societyId: string) {
    return this.helpdesk.activities(societyId, ticketId);
  }

  @Get('review/queue')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  queue(@CurrentTenant() societyId: string) {
    return this.helpdesk.listReview(societyId);
  }

  @Post('review/:ticketId/comments')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  reviewComment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: AddHelpdeskCommentDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.helpdesk.addComment(societyId, this.requireUser(userId), ticketId, dto.message, true);
  }

  @Patch('review/:ticketId/status')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  status(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: UpdateHelpdeskStatusDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.helpdesk.updateStatus(societyId, this.requireUser(userId), ticketId, dto.status, dto.note);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
