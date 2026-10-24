import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';

/** Statement combines invoice and payment evidence: both features are required. */
@Injectable()
export class StatementFeatureGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementService) {}
  async canActivate(context: ExecutionContext) {
    const societyId = context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.societyId;
    if (!societyId) throw new ForbiddenException('Society context is required');
    for (const feature of [ProductFeature.MAINTENANCE_BILLING, ProductFeature.PAYMENTS]) {
      if (!await this.entitlements.isEnabled(societyId, feature)) throw new ForbiddenException('Billing and payment features are required for maintenance statements');
    }
    return true;
  }
}
