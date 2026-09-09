import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductFeature, ProductTier, TIER_FEATURES } from './entitlement.types';

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async current(societyId: string): Promise<{ productTier: ProductTier; enabledFeatures: ProductFeature[] } | null> {
    const society = await this.prisma.society.findFirst({
      where: { id: societyId, status: 'ACTIVE' },
      select: { productTier: true, featureOverrides: true },
    });
    if (!society) return null;

    const productTier = society.productTier as ProductTier;
    const overrides = this.readOverrides(society.featureOverrides);
    const enabledFeatures = Object.values(ProductFeature).filter((feature) => {
      if (typeof overrides[feature] === 'boolean') return overrides[feature];
      return TIER_FEATURES[productTier].includes(feature);
    });

    return { productTier, enabledFeatures };
  }

  async isEnabled(societyId: string, feature: ProductFeature): Promise<boolean> {
    const current = await this.current(societyId);
    return !!current?.enabledFeatures.includes(feature);
  }

  private readOverrides(value: unknown): Partial<Record<ProductFeature, boolean>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Partial<Record<ProductFeature, boolean>>;
  }
}
