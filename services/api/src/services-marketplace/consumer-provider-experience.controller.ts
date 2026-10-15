import {
  BadRequestException,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsIn, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerProviderExperienceService } from './consumer-provider-experience.service';
import { ConsumerServiceLocationType } from './consumer-service-location.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ProviderExperienceQueryDto {
  @IsIn(['HOME', 'SOCIETY_UNIT'])
  locationType!: ConsumerServiceLocationType;

  @IsUUID()
  locationId!: string;
}

@Controller('consumer/services/providers')
@UseGuards(BearerGuard)
export class ConsumerProviderExperienceController {
  constructor(private readonly experience: ConsumerProviderExperienceService) {}

  @Get(':providerId/experience')
  getExperience(
    @CurrentConsumerUser() userId: string,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query() query: ProviderExperienceQueryDto,
  ) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!query.locationType || !query.locationId) {
      throw new BadRequestException('locationType and locationId are required');
    }
    return this.experience.getForLocation(userId, providerId, query.locationType, query.locationId);
  }
}
