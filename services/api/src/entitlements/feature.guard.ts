import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { EntitlementService } from './entitlement.service';
import { REQUIRED_FEATURE_KEY } from './feature.decorator';
import { ProductFeature } from './entitlement.types';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly entitlements: EntitlementService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<ProductFeature>(REQUIRED_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const societyId = request.auth?.societyId;
    if (!societyId) throw new ForbiddenException('Society context is required');

    if (!(await this.entitlements.isEnabled(societyId, feature))) {
      throw new ForbiddenException(`Feature ${feature} is not enabled for this society`);
    }
    return true;
  }
}
