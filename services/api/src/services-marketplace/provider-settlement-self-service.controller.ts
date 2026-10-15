import { Controller, ExecutionContext, Get, Param, ParseUUIDPipe, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { ProviderSettlementService } from './provider-settlement.service';

const CurrentProviderSettlementUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

@Controller('provider/services/settlements')
@UseGuards(BearerGuard)
export class ProviderSettlementSelfServiceController{
  constructor(
    private readonly operators:ConsumerProviderOperatorService,
    private readonly settlements:ProviderSettlementService,
  ){}

  @Get('summary')
  async summary(@CurrentProviderSettlementUser() userId:string|undefined){
    const provider=await this.operators.resolveProvider(this.actor(userId));
    const rows=await this.settlements.providerSummary(provider.providerId) as Array<Record<string,unknown>>;
    return rows[0]??{paidPaise:0,approvedPaise:0,draftPaise:0,openRecoveryPaise:0,openRecoveryCount:0};
  }

  @Get()
  async list(@CurrentProviderSettlementUser() userId:string|undefined){
    const provider=await this.operators.resolveProvider(this.actor(userId));
    return this.settlements.listForProvider(provider.providerId);
  }

  @Get('recoveries')
  async recoveries(@CurrentProviderSettlementUser() userId:string|undefined){
    const provider=await this.operators.resolveProvider(this.actor(userId));
    return this.settlements.listRecoveries(provider.providerId);
  }

  @Get(':batchId/entries')
  async entries(
    @CurrentProviderSettlementUser() userId:string|undefined,
    @Param('batchId',ParseUUIDPipe) batchId:string,
  ){
    const provider=await this.operators.resolveProvider(this.actor(userId));
    return this.settlements.entriesForProvider(provider.providerId,batchId);
  }

  private actor(userId:string|undefined){
    if(!userId)throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
