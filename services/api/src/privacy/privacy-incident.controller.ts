import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrivacyIncidentService } from './privacy-incident.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
const INCIDENT_CATEGORIES = ['LOSS','UNAUTHORIZED_ACCESS','DISCLOSURE','INTEGRITY','AVAILABILITY','OTHER'] as const;
const INCIDENT_SEVERITIES = ['CRITICAL','HIGH','MEDIUM','LOW'] as const;
const INCIDENT_STATUSES = ['OPEN','CONTAINING','INVESTIGATING','REMEDIATING','CLOSED'] as const;

class GrievanceContactDto {
  @IsString() @MaxLength(160) displayName!: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) instructions?: string;
  @IsBoolean() active!: boolean;
}

class CreatePrivacyIncidentDto {
  @IsIn(INCIDENT_CATEGORIES) category!: (typeof INCIDENT_CATEGORIES)[number];
  @IsIn(INCIDENT_SEVERITIES) severity!: (typeof INCIDENT_SEVERITIES)[number];
  @IsString() @MaxLength(2000) summary!: string;
  @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true }) affectedDataCategoryCodes!: string[];
  @IsOptional() @IsInt() @Min(0) @Max(100000000) affectedSubjectEstimate?: number;
  @IsBoolean() minorDataSuspected!: boolean;
  @IsISO8601() detectedAt!: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
}

class UpdatePrivacyIncidentStatusDto {
  @IsIn(INCIDENT_STATUSES) status!: (typeof INCIDENT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('privacy')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class PrivacyIncidentController {
  constructor(private readonly incidents: PrivacyIncidentService) {}

  @Get('grievance-contact')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  getGrievance(@CurrentTenant() societyId: string) {
    return this.incidents.getGrievanceContact(societyId);
  }

  @Put('grievance-contact')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  putGrievance(@Body() dto: GrievanceContactDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.incidents.upsertGrievanceContact(societyId, this.requireUser(userId), dto);
  }

  @Get('security-incidents')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  list(@CurrentTenant() societyId: string) {
    return this.incidents.listIncidents(societyId);
  }

  @Post('security-incidents')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  create(@Body() dto: CreatePrivacyIncidentDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.incidents.createIncident(societyId, this.requireUser(userId), dto);
  }

  @Patch('security-incidents/:incidentId/status')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  status(@Param('incidentId', ParseUUIDPipe) incidentId: string, @Body() dto: UpdatePrivacyIncidentStatusDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.incidents.updateStatus(societyId, this.requireUser(userId), incidentId, dto.status, dto.note);
  }

  @Get('security-incidents/:incidentId/history')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  history(@Param('incidentId', ParseUUIDPipe) incidentId: string, @CurrentTenant() societyId: string) {
    return this.incidents.history(societyId, incidentId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
