import { Body, Controller, ExecutionContext, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { OperationalUsageEventType, OperationalUsageService } from './operational-usage.service';

const CurrentPrincipal=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth);

class UsageEventDto {
  @IsIn(['PROPERTY_CONTEXT_SWITCHED','SERVICE_DISCOVERY_VIEWED'])
  eventType!:OperationalUsageEventType;
}

@Controller('analytics')
@UseGuards(BearerGuard)
export class OperationalUsageController {
  constructor(private readonly usage:OperationalUsageService) {}

  @Post('usage')
  async record(@CurrentPrincipal() auth:AuthenticatedRequest['auth'],@Body() dto:UsageEventDto){
    if(!auth?.userId) return {recorded:false};
    await this.usage.record(auth.userId,auth.societyId,dto.eventType);
    return {recorded:true};
  }
}
