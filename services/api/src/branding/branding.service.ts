import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthPrincipal } from '../auth/auth.types';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { BrandBootstrap, BrandContextConfig } from './branding.types';

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService) {}

  bootstrap(): BrandBootstrap {
    // No runtime partner selection until ownership/audience/isolation gates pass.
    // Return fresh objects so request-local changes cannot poison later responses.
    return {
      schemaVersion: 1,
      revision: 'aaraagate-default-v1',
      brand: {
        id: 'aaraagate',
        displayName: 'Aaraagate',
        colors: { primary: '#0EABBE', primaryDeep: '#05879A' },
      },
    };
  }

  async context(principal: AuthPrincipal | undefined): Promise<BrandContextConfig> {
    if (!principal?.userId) throw new UnauthorizedException('Authentication required');
    if (!principal.societyId) {
      // Independent-home identity never inherits society roles or entitlements.
      return { branding: this.bootstrap(), society: null, entitlements: null };
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: { userId: principal.userId, societyId: principal.societyId, active: true },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Society branding context is unavailable');

    const [society, entitlements] = await Promise.all([
      this.prisma.society.findFirst({
        where: { id: principal.societyId, status: 'ACTIVE' },
        select: { id: true, name: true },
      }),
      this.entitlements.current(principal.societyId),
    ]);
    if (!society || !entitlements) throw new ForbiddenException('Society branding context is unavailable');

    return {
      branding: this.bootstrap(),
      society,
      // Preserve the existing resolver, including authorized legacy overrides.
      entitlements: { ...entitlements, enabledFeatures: [...entitlements.enabledFeatures] },
    };
  }
}
