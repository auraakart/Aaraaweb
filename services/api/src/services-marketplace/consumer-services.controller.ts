import {
  Controller,
  ExecutionContext,
  Get,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { ProviderVerificationStatus } from '@prisma/client';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerAvailabilityService } from './consumer-availability.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ConsumerOfferingsQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
}

class ConsumerAvailabilityQueryDto {
  @IsUUID() homeId!: string;
  @IsUUID() offeringId!: string;
  @IsISO8601() scheduledFrom!: string;
  @IsISO8601() scheduledUntil!: string;
}

/**
 * Platform-scoped external-services catalog.
 *
 * This controller intentionally does not use TenantGuard, society entitlements,
 * or society permissions. It is available to any authenticated Aaraagate user,
 * including an independent-home session with no societyId. Society-only APIs
 * remain protected by their existing tenant guards.
 */
@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ConsumerAvailabilityService,
  ) {}

  @Get('categories')
  categories() {
    return this.prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('offerings')
  offerings(@Query() query: ConsumerOfferingsQueryDto) {
    return this.prisma.serviceOffering.findMany({
      where: {
        active: true,
        categoryId: query.categoryId || undefined,
        provider: {
          active: true,
          verification: ProviderVerificationStatus.VERIFIED,
        },
      },
      include: {
        category: true,
        provider: {
          select: {
            id: true,
            businessName: true,
            description: true,
          },
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
  }

  @Get('availability')
  availabilityCheck(
    @CurrentConsumerUser() userId: string,
    @Query() query: ConsumerAvailabilityQueryDto,
  ) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.availability.checkAvailability(
      userId,
      query.homeId,
      query.offeringId,
      new Date(query.scheduledFrom),
      new Date(query.scheduledUntil),
    );
  }
}
