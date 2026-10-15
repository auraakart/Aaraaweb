import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Put, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ProviderOfferingContinuityService } from './provider-offering-continuity.service';

const CurrentProviderUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class OfferingContinuityPolicyDto {
  @IsOptional() @IsInt() @Min(1) @Max(3650)
  warrantyDays?: number | null;

  @IsOptional() @IsString() @MaxLength(500)
  revisitPolicy?: string | null;
}

@Controller('provider/services/offerings')
@UseGuards(BearerGuard)
export class ProviderOfferingContinuityController {
  constructor(private readonly continuity: ProviderOfferingContinuityService) {}

  @Get(':offeringId/continuity-policy')
  getPolicy(
    @CurrentProviderUser() userId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ) {
    return this.continuity.getMyPolicy(this.requireUser(userId), offeringId);
  }

  @Put(':offeringId/continuity-policy')
  setPolicy(
    @CurrentProviderUser() userId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: OfferingContinuityPolicyDto,
  ) {
    return this.continuity.setMyPolicy(this.requireUser(userId), offeringId, dto);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
