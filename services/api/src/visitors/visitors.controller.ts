import { BadRequestException, Body, Controller, Post, UseGuards, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { BearerGuard, AuthenticatedRequest } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { GateAccessGuard } from '../gates/gate-access.guard';
import { VisitorService } from './visitor.service';
import { VisitorVerificationService } from './visitor-verification.service';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreatePassDto { @IsUUID() unitId!: string; @IsString() @IsNotEmpty() name!: string; @IsString() @IsNotEmpty() phone!: string; @IsDateString() validFrom!: string; @IsDateString() validUntil!: string; }
class GateCredentialDto { @IsUUID() gateId!: string; @IsString() @IsNotEmpty() credential!: string; }

@Controller('visitors')
@UseGuards(BearerGuard, TenantGuard)
export class VisitorsController {
  constructor(private readonly visitors: VisitorService, private readonly verification: VisitorVerificationService) {}

  @Post('passes')
  createPass(@Body() dto: CreatePassDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.createPass(societyId, hostUserId, dto.unitId, dto.name, dto.phone, new Date(dto.validFrom), new Date(dto.validUntil));
  }
  @Post('verify') @UseGuards(GateAccessGuard) verify(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) { return this.verification.verify(societyId, dto.gateId, dto.credential, actorUserId); }
  @Post('check-in') @UseGuards(GateAccessGuard) checkIn(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) { return this.verification.checkIn(societyId, dto.gateId, dto.credential, actorUserId); }
  @Post('check-out') @UseGuards(GateAccessGuard) checkOut(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) { return this.verification.checkOut(societyId, dto.gateId, dto.credential, actorUserId); }
}
