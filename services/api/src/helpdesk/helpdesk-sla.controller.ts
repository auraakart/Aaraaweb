import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { HelpdeskSlaService } from './helpdesk-sla.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class UpsertSlaPolicyDto {
  @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority!: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
  @IsInt() @Min(1) @Max(43200) firstResponseMinutes!: number;
  @IsInt() @Min(1) @Max(525600) resolutionMinutes!: number;
  @IsInt() @Min(1) @Max(525600) escalationAfterMinutes!: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID() escalationTargetUserId?: string | null;
  @IsOptional() @IsBoolean() automaticEscalationEnabled?: boolean;
}
class EscalateTicketDto {
  @IsUUID() escalatedToId!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('helpdesk/sla')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.HELPDESK)
export class HelpdeskSlaController {
  constructor(private readonly sla: HelpdeskSlaService) {}

  @Get('policies')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  policies(@CurrentTenant() societyId: string) {
    return this.sla.listPolicies(societyId);
  }

  @Put('policies')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  upsertPolicy(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Body() dto: UpsertSlaPolicyDto) {
    return this.sla.upsertPolicy(societyId, this.requireUser(userId), dto);
  }

  @Get('queue')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  queue(@CurrentTenant() societyId: string) {
    return this.sla.listQueue(societyId);
  }

  @Post(':ticketId/apply-policy')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  applyPolicy(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.sla.applyPolicy(societyId, this.requireUser(userId), ticketId);
  }

  @Post(':ticketId/evaluate')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  evaluate(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.sla.evaluate(societyId, this.requireUser(userId), ticketId);
  }

  @Post(':ticketId/escalate')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  escalate(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('ticketId', ParseUUIDPipe) ticketId: string, @Body() dto: EscalateTicketDto) {
    return this.sla.escalate(societyId, this.requireUser(userId), ticketId, dto.escalatedToId, dto.note);
  }

  @Get(':ticketId/history')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  history(@CurrentTenant() societyId: string, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.sla.history(societyId, ticketId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
