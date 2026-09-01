import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductFeature, ProductTier, TIER_FEATURES } from './entitlement.types';

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(societyId: string, feature: ProductFeature): Promise<boolean> {
    const society = await this.prisma.society.findFirst({
      where: { id: societyId, status: 'ACTIVE' },
      select: { productTier: true, featureOverrides: true },
    });
    if (!society) return false;

    const overrides = this.readOverrides(society.featureOverrides);
    if (typeof overrides[feature] === 'boolean') return overrides[feature];

    return TIER_FEATURES[society.productTier as ProductTier].includes(feature);
  }

  private readOverrides(value: unknown): Partial<Record<ProductFeature, boolean>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Partial<Record<ProductFeature, boolean>>;
  }
}
