import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProviderVerificationStatus } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { PrismaService } from '../prisma/prisma.service';

class ConsumerOfferingsQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
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
  constructor(private readonly prisma: PrismaService) {}

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
}
