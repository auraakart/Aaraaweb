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
import { ProviderVerificationStatus } from '@prisma/client';
import { IsISO8601, IsIn, IsOptional, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerAvailabilityService } from './consumer-availability.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ConsumerOfferingsQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsIn(['HOME', 'SOCIETY_UNIT']) locationType?: ConsumerServiceLocationType;
  @IsOptional() @IsUUID() locationId?: string;
}

class ConsumerAvailabilityQueryDto {
  @IsOptional() @IsUUID() homeId?: string;
  @IsOptional() @IsIn(['HOME', 'SOCIETY_UNIT']) locationType?: ConsumerServiceLocationType;
  @IsOptional() @IsUUID() locationId?: string;
  @IsUUID() offeringId!: string;
  @IsISO8601() scheduledFrom!: string;
  @IsISO8601() scheduledUntil!: string;
}

@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ConsumerAvailabilityService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  @Get('locations')
  listLocations(@CurrentConsumerUser() userId: string) {
    return this.locations.listLocations(this.requireUser(userId));
  }

  @Get('categories')
  categories() {
    return this.prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('offerings')
  offerings(@CurrentConsumerUser() userId: string, @Query() query: ConsumerOfferingsQueryDto) {
    const scoped = query.locationType || query.locationId;
    if (scoped) {
      if (!query.locationType || !query.locationId) throw new BadRequestException('locationType and locationId are required together');
      return this.locations.listServiceableOfferings(
        this.requireUser(userId),
        query.locationType,
        query.locationId,
        query.categoryId,
      );
    }

    return this.prisma.serviceOffering.findMany({
      where: {
        active: true,
        categoryId: query.categoryId || undefined,
        provider: { active: true, verification: ProviderVerificationStatus.VERIFIED },
      },
      include: {
        category: true,
        provider: { select: { id: true, businessName: true, description: true } },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
  }

  @Get('availability')
  async availabilityCheck(@CurrentConsumerUser() userId: string, @Query() query: ConsumerAvailabilityQueryDto) {
    const authenticatedUserId = this.requireUser(userId);
    if (query.homeId) {
      if (query.locationType || query.locationId) throw new BadRequestException('Use either homeId or locationType/locationId');
      return this.availability.checkAvailability(
        authenticatedUserId,
        query.homeId,
        query.offeringId,
        new Date(query.scheduledFrom),
        new Date(query.scheduledUntil),
      );
    }
    if (!query.locationType || !query.locationId) throw new BadRequestException('A service delivery location is required');
    const location = await this.locations.resolveLocation(authenticatedUserId, query.locationType, query.locationId);
    return this.availability.checkAvailabilityForPostalCode(
      location.postalCode,
      query.offeringId,
      new Date(query.scheduledFrom),
      new Date(query.scheduledUntil),
    );
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
