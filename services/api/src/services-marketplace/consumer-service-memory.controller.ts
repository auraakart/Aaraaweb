import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerServiceLocationType } from './consumer-service-location.service';
import { ConsumerServiceMemoryService } from './consumer-service-memory.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class FavoriteProviderDto {
  @IsBoolean()
  active!: boolean;
}

class ServiceHistoryQueryDto {
  @IsIn(['HOME', 'SOCIETY_UNIT'])
  locationType!: ConsumerServiceLocationType;

  @IsUUID()
  locationId!: string;
}

@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerServiceMemoryController {
  constructor(private readonly memory: ConsumerServiceMemoryService) {}

  @Get('favorites')
  listFavorites(@CurrentConsumerUser() userId: string) {
    return this.memory.listFavorites(this.requireUser(userId));
  }

  @Put('favorites/:providerId')
  setFavorite(
    @CurrentConsumerUser() userId: string,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() body: FavoriteProviderDto,
  ) {
    return this.memory.setFavorite(this.requireUser(userId), providerId, body.active);
  }

  @Get('history')
  listHistory(@CurrentConsumerUser() userId: string, @Query() query: ServiceHistoryQueryDto) {
    return this.memory.listHistory(this.requireUser(userId), query.locationType, query.locationId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
