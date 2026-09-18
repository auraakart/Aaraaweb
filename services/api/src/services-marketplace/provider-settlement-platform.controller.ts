import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsString, IsUUID, Length } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ProviderSettlementService } from './provider-settlement.service';

const CurrentPlatformSettlementUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateSettlementDto{
  @IsUUID()
  providerId!:string;
}
class ResolveRecoveryDto{
  @IsString()
  @Length(3,200)
  recoveryReference!:string;
}
class MarkSettlementPaidDto{
  @IsString()
  @Length(3,200)
  paymentReference!:string;
}

@Controller('platform/services/provider-settlements')
@UseGuards(BearerGuard,PermissionsGuard)
export class ProviderSettlementPlatformController{
  constructor(private readonly settlements:ProviderSettlementService){}

  @Get()
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)
  list(){ return this.settlements.list(); }

  @Get('providers/:providerId/eligible')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)
  eligible(@Param('providerId',ParseUUIDPipe) providerId:string){ return this.settlements.eligible(providerId); }

  @Get(':batchId/entries')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)
  entries(@Param('batchId',ParseUUIDPipe) batchId:string){ return this.settlements.entries(batchId); }

  @Get(':batchId/events')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)
  events(@Param('batchId',ParseUUIDPipe) batchId:string){ return this.settlements.events(batchId); }

  @Get('recoveries')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)
  recoveries(){ return this.settlements.listRecoveries(); }

  @Post('recoveries/:recoveryId/resolve')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)
  resolveRecovery(
    @CurrentPlatformSettlementUser() actorUserId:string|undefined,
    @Param('recoveryId',ParseUUIDPipe) recoveryId:string,
    @Body() dto:ResolveRecoveryDto,
  ){
    return this.settlements.resolveRecovery(this.actor(actorUserId),recoveryId,dto.recoveryReference);
  }

  @Post()
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)
  create(@CurrentPlatformSettlementUser() actorUserId:string|undefined,@Body() dto:CreateSettlementDto){
    return this.settlements.createDraft(this.actor(actorUserId),dto.providerId);
  }

  @Post(':batchId/approve')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)
  approve(@CurrentPlatformSettlementUser() actorUserId:string|undefined,@Param('batchId',ParseUUIDPipe) batchId:string){
    return this.settlements.approve(this.actor(actorUserId),batchId);
  }

  @Post(':batchId/mark-paid')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)
  markPaid(
    @CurrentPlatformSettlementUser() actorUserId:string|undefined,
    @Param('batchId',ParseUUIDPipe) batchId:string,
    @Body() dto:MarkSettlementPaidDto,
  ){
    return this.settlements.markPaid(this.actor(actorUserId),batchId,dto.paymentReference);
  }

  @Post(':batchId/cancel')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)
  cancel(@CurrentPlatformSettlementUser() actorUserId:string|undefined,@Param('batchId',ParseUUIDPipe) batchId:string){
    return this.settlements.cancel(this.actor(actorUserId),batchId);
  }

  private actor(userId:string|undefined){
    if(!userId)throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
