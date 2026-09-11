import {
  BadRequestException,
  Controller,
  ExecutionContext,
  Get,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerCommercialDiscoveryService } from './consumer-commercial-discovery.service';
import { ConsumerServiceLocationType } from './consumer-service-location.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ConsumerCommercialDiscoveryQueryDto {
  @IsIn(['HOME', 'SOCIETY_UNIT']) locationType!: ConsumerServiceLocationType;
  @IsUUID() locationId!: string;
  @IsOptional() @IsUUID() categoryId?: string;
}

@Controller('consumer/services/commercial-placements')
@UseGuards(BearerGuard)
export class ConsumerCommercialDiscoveryController {
  constructor(private readonly commercial: ConsumerCommercialDiscoveryService) {}

  @Get()
  list(@CurrentConsumerUser() userId: string, @Query() query: ConsumerCommercialDiscoveryQueryDto) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!query.locationType || !query.locationId) throw new BadRequestException('locationType and locationId are required');
    return this.commercial.list(userId, query.locationType, query.locationId, query.categoryId);
  }
}
