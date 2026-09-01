import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { BearerGuard, AuthenticatedRequest } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { GateAccessGuard } from '../gates/gate-access.guard';
import { VisitorService } from './visitor.service';
import { VisitorVerificationService } from './visitor-verification.service';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateVisitorRequestDto {
  @IsUUID() unitId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() purpose?: string;
}

class CreatePassDto {
  @IsUUID() unitId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
}

class ApproveVisitorDto {
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
}

class GateCredentialDto {
  @IsUUID() gateId!: string;
  @IsString() @IsNotEmpty() credential!: string;
}

@Controller('visitors')
@UseGuards(BearerGuard, TenantGuard)
export class VisitorsController {
  constructor(private readonly visitors: VisitorService, private readonly verification: VisitorVerificationService) {}

  @Get('mine')
  listMine(@CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.listForHost(societyId, hostUserId);
  }

  @Post('requests')
  createRequest(@Body() dto: CreateVisitorRequestDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.createRequest(societyId, hostUserId, dto.unitId, dto.name, dto.phone, dto.purpose);
  }

  @Post(':visitorId/approve')
  approve(@Param('visitorId') visitorId: string, @Body() dto: ApproveVisitorDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.approve(societyId, hostUserId, visitorId, new Date(dto.validFrom), new Date(dto.validUntil));
  }

  @Post(':visitorId/deny')
  deny(@Param('visitorId') visitorId: string, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.deny(societyId, hostUserId, visitorId);
  }

  @Post(':visitorId/cancel')
  cancel(@Param('visitorId') visitorId: string, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.cancel(societyId, hostUserId, visitorId);
  }

  @Post('passes')
  createPass(@Body() dto: CreatePassDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.createPass(societyId, hostUserId, dto.unitId, dto.name, dto.phone, new Date(dto.validFrom), new Date(dto.validUntil));
  }

  @Post('verify')
  @UseGuards(GateAccessGuard)
  verify(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    return this.verification.verify(societyId, dto.gateId, dto.credential, actorUserId);
  }

  @Post('check-in')
  @UseGuards(GateAccessGuard)
  checkIn(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    return this.verification.checkIn(societyId, dto.gateId, dto.credential, actorUserId);
  }

  @Post('check-out')
  @UseGuards(GateAccessGuard)
  checkOut(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    return this.verification.checkOut(societyId, dto.gateId, dto.credential, actorUserId);
  }
}
