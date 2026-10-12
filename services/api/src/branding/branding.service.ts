import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { BrandBootstrap, BrandContextConfig } from './branding.types';
import { societyBrandDigest, validateSocietyBrandPresentation } from './branding-contract';

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly memberships: PrismaMembershipRepository,
  ) {}

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

    const societyId = principal.societyId;
    return this.prisma.withTenantContext(societyId, async tx => {
      const memberships = await this.memberships.findActiveByUserAndSociety(principal.userId, societyId, tx);
      if (!memberships.length) throw new ForbiddenException('Society branding context is unavailable');

      const [society, entitlements, published] = await Promise.all([
        tx.society.findFirst({
          where: { id: societyId, status: 'ACTIVE' },
          select: { id: true, name: true },
        }),
        this.entitlements.current(societyId, tx),
        tx.societyBrandRevision.findFirst({
          where: { societyId, publishedAt: { not: null } },
          orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
          select: { version: true, config: true, digest: true },
        }),
      ]);
      if (!society || !entitlements) throw new ForbiddenException('Society branding context is unavailable');

      // A corrupt/stale published presentation may not poison the scoped
      // identity/entitlement response; fall back to the exact default theme.
      const branding = this.bootstrap();
      if (published) {
        try {
          const config = validateSocietyBrandPresentation(published.config);
          if (societyBrandDigest(config) === published.digest) {
            branding.revision = `society-${societyId}-v${published.version}`;
            if (config.displayName) branding.brand.displayName = config.displayName;
            if (config.colors) branding.brand.colors = { ...config.colors };
          }
        } catch {
          // Malformed unpublished data never becomes executable styles or flags.
        }
      }
      return {
        branding,
        society,
        // Preserve the existing resolver, including authorized legacy overrides.
        entitlements: { ...entitlements, enabledFeatures: [...entitlements.enabledFeatures] },
      };
    });
  }

  /** Society brand editor only: operational permissions are reloaded on this transaction. */
  private async requireEditor(societyId: string, userId: string, tx: Prisma.TransactionClient) {
    const membership = await this.memberships.findActiveByUserAndSociety(userId, societyId, tx);
    if (!hasPermission(membership.map(row => row.role), AppPermission.SOCIETY_CONFIGURATION_MANAGE)) {
      throw new ForbiddenException('Society branding management permission required');
    }
    const society = await tx.society.findFirst({ where: { id: societyId, status: 'ACTIVE' }, select: { id: true } });
    if (!society) throw new NotFoundException('Active society not found');
  }

  private async lockSociety(societyId: string, tx: Prisma.TransactionClient) {
    // Serialize version allocation and publication on the same society row.
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid AND "status"='ACTIVE'
      LIMIT 1 FOR UPDATE
    `);
    if (!rows.length) throw new NotFoundException('Active society not found');
  }

  async history(societyId: string, userId: string) {
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.requireEditor(societyId, userId, tx);
      return tx.societyBrandRevision.findMany({
        where: { societyId },
        orderBy: { version: 'desc' },
        take: 100,
        select: { id: true, version: true, schemaVersion: true, config: true, digest: true, publishedAt: true, createdAt: true },
      });
    });
  }

  async createDraft(societyId: string, userId: string, input: { expectedVersion: number; config: unknown }) {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
      throw new ConflictException('Expected society branding version is invalid');
    const config = validateSocietyBrandPresentation(input.config);
    const digest = societyBrandDigest(config);
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.requireEditor(societyId, userId, tx);
      await this.lockSociety(societyId, tx);
      const latest = await tx.societyBrandRevision.findFirst({
        where: { societyId }, orderBy: { version: 'desc' }, select: { version: true },
      });
      if ((latest?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Society branding was modified; reload revisions');
      return tx.societyBrandRevision.create({
        data: { societyId, createdById: userId, version: input.expectedVersion + 1, config: config as Prisma.InputJsonValue, digest },
        select: { id: true, version: true, config: true, digest: true, publishedAt: true },
      });
    });
  }

  async publish(societyId: string, userId: string, revisionId: string, expectedPublishedVersion: number) {
    if (!Number.isSafeInteger(expectedPublishedVersion) || expectedPublishedVersion < 0)
      throw new ConflictException('Expected published branding version is invalid');
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.requireEditor(societyId, userId, tx);
      await this.lockSociety(societyId, tx);
      const current = await tx.societyBrandRevision.findFirst({
        where: { societyId, publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
        select: { version: true },
      });
      if ((current?.version ?? 0) !== expectedPublishedVersion)
        throw new ConflictException('Published society branding has changed');
      const draft = await tx.societyBrandRevision.findFirst({
        where: { societyId, id: revisionId, publishedAt: null },
        select: { id: true, version: true, config: true, digest: true },
      });
      if (!draft) throw new NotFoundException('Unpublished society branding revision not found');
      if (draft.version <= expectedPublishedVersion)
        throw new ConflictException('Cannot publish an older branding revision');
      const config = validateSocietyBrandPresentation(draft.config);
      if (societyBrandDigest(config) !== draft.digest)
        throw new ConflictException('Branding revision failed integrity verification');
      const result = await tx.societyBrandRevision.updateMany({
        where: { id: draft.id, societyId, publishedAt: null },
        data: { publishedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('Branding revision is no longer publishable');
      return { id: draft.id, version: draft.version, revision: `society-${societyId}-v${draft.version}`, published: true };
    });
  }
}
