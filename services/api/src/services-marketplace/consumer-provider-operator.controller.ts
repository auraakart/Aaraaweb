import { Body, Controller, ExecutionContext, Get, Param, Patch, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, Matches } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

const CurrentProviderUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class PostalCodeDto {
  @Matches(/^[1-9][0-9]{5}$/)
  postalCode!: string;
}

class ActiveDto {
  @IsBoolean()
  active!: boolean;
}

@Controller('provider/services')
@UseGuards(BearerGuard)
export class ConsumerProviderOperatorController {
  constructor(private readonly providers: ConsumerProviderOperatorService) {}

  @Get('me')
  me(@CurrentProviderUser() userId: string) {
    return this.providers.resolveProvider(this.requireUser(userId));
  }

  @Get('areas')
  areas(@CurrentProviderUser() userId: string) {
    return this.providers.listMyServiceAreas(this.requireUser(userId));
  }

  @Post('areas')
  addArea(@CurrentProviderUser() userId: string, @Body() dto: PostalCodeDto) {
    return this.providers.addMyServiceArea(this.requireUser(userId), dto.postalCode);
  }

  @Patch('areas/:areaId')
  setArea(@CurrentProviderUser() userId: string, @Param('areaId') areaId: string, @Body() dto: ActiveDto) {
    return this.providers.setMyServiceAreaActive(this.requireUser(userId), areaId, dto.active);
  }

  @Get('offerings')
  offerings(@CurrentProviderUser() userId: string) {
    return this.providers.listMyOfferings(this.requireUser(userId));
  }

  @Get('offerings/:offeringId/areas')
  offeringAreas(@CurrentProviderUser() userId: string, @Param('offeringId') offeringId: string) {
    return this.providers.listMyOfferingAreas(this.requireUser(userId), offeringId);
  }

  @Post('offerings/:offeringId/areas')
  addOfferingArea(@CurrentProviderUser() userId: string, @Param('offeringId') offeringId: string, @Body() dto: PostalCodeDto) {
    return this.providers.addMyOfferingArea(this.requireUser(userId), offeringId, dto.postalCode);
  }

  @Patch('offerings/:offeringId/areas/:areaId')
  setOfferingArea(
    @CurrentProviderUser() userId: string,
    @Param('offeringId') offeringId: string,
    @Param('areaId') areaId: string,
    @Body() dto: ActiveDto,
  ) {
    return this.providers.setMyOfferingAreaActive(this.requireUser(userId), offeringId, areaId, dto.active);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
