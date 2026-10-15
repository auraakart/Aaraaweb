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
import { IsBoolean, IsIn, IsUUID, ValidateIf } from 'class-validator';
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

class TechnicianPreferenceDto {
  @ValidateIf((_, value: unknown) => value !== null)
  @IsUUID()
  agentId!: string | null;
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

  @Get('recent-providers')
  listRecentProviders(@CurrentConsumerUser() userId: string) {
    return this.memory.listRecentProviders(this.requireUser(userId));
  }

  @Put('favorites/:providerId')
  setFavorite(
    @CurrentConsumerUser() userId: string,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() body: FavoriteProviderDto,
  ) {
    return this.memory.setFavorite(this.requireUser(userId), providerId, body.active);
  }

  @Get('recurring-plans/:planId/technician-continuity')
  technicianContinuity(
    @CurrentConsumerUser() userId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.memory.getRecurringTechnicianContinuity(this.requireUser(userId), planId);
  }

  @Get('bookings/:bookingId/technician-preference')
  bookingTechnicianPreference(
    @CurrentConsumerUser() userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.memory.getBookingTechnicianPreference(this.requireUser(userId), bookingId);
  }

  @Put('bookings/:bookingId/technician-preference')
  setBookingTechnicianPreference(
    @CurrentConsumerUser() userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: TechnicianPreferenceDto,
  ) {
    return this.memory.setBookingTechnicianPreference(this.requireUser(userId), bookingId, dto.agentId);
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
