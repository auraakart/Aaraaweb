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
import { ConsumerOffersService } from './consumer-offers.service';
import { ConsumerServiceLocationType } from './consumer-service-location.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ConsumerOffersQueryDto {
  @IsIn(['HOME', 'SOCIETY_UNIT'])
  locationType!: ConsumerServiceLocationType;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

@Controller('consumer/services/offers')
@UseGuards(BearerGuard)
export class ConsumerOffersController {
  constructor(private readonly offers: ConsumerOffersService) {}

  @Get()
  list(
    @CurrentConsumerUser() userId: string,
    @Query() query: ConsumerOffersQueryDto,
  ) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!query.locationType || !query.locationId) {
      throw new BadRequestException('locationType and locationId are required');
    }
    return this.offers.listForLocation(userId, query.locationType, query.locationId, query.categoryId);
  }
}
