import { SetMetadata } from '@nestjs/common';
import { ProductFeature } from './entitlement.types';

export const REQUIRED_FEATURE_KEY = 'aaraagate.requiredFeature';

export const RequiresFeature = (feature: ProductFeature) =>
  SetMetadata(REQUIRED_FEATURE_KEY, feature);
