import { Controller, ExecutionContext, Get, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { ProviderCommercialService } from './provider-commercial.service';

const CurrentProviderUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

@Controller('provider/services/commercial')
@UseGuards(BearerGuard)
export class ProviderCommercialSelfServiceController {
  constructor(
    private readonly operators: ConsumerProviderOperatorService,
    private readonly commercial: ProviderCommercialService,
  ) {}

  @Get()
  async getMine(@CurrentProviderUser() userId: string) {
    const provider = await this.operators.resolveProvider(this.requireUser(userId));
    return this.commercial.get(provider.providerId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
