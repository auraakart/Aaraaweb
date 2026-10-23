import { PartnerBrandService } from './partner-brand.service';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException, Optional } from '@nestjs/common';
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
    @Optional() private readonly partnerBrands?: PartnerBrandService,
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
          select: { id: true, name: true, partnerId: true, ownershipVersion: true },
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
      let config: import('./branding-contract').SocietyBrandPresentation = {};
      let societyVersion = 0;
      if (published) {
        try {
          const checked = validateSocietyBrandPresentation(published.config);
          if (societyBrandDigest(checked) === published.digest) { config = checked; societyVersion = published.version; }
        } catch { /* Corrupt presentation falls back without changing authority. */ }
      }
      const effective = this.partnerBrands ? await this.partnerBrands.resolve(tx, society, config) : { config, partnerVersion: 0 };
      if (societyVersion || effective.partnerVersion) branding.revision = `society-${societyId}-v${societyVersion}${effective.partnerVersion ? '-p' + effective.partnerVersion : ''}`;
      if (effective.config.displayName) branding.brand.displayName = effective.config.displayName;
      if (effective.config.colors) branding.brand.colors = { ...effective.config.colors };
      if (effective.config.support) branding.brand.support = { ...effective.config.support };
      return {
        branding,
        society: { id: society.id, name: society.name },
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
      const select = { id: true, version: true, schemaVersion: true, config: true, digest: true, publishedAt: true, createdAt: true } as const;
      const rows = await tx.societyBrandRevision.findMany({
        where: { societyId }, orderBy: { version: 'desc' }, take: 100, select,
      });
      const published = await tx.societyBrandRevision.findFirst({
        where: { societyId, publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }], select,
      });
      // Preserve the legacy bounded array contract, pinning authoritative
      // publication even when more than 100 newer unpublished drafts exist.
      return published && !rows.some(row => row.id === published.id)
        ? [...rows.slice(0, 99), published] : rows;
    });
  }

  publications(societyId: string, userId: string) {
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.requireEditor(societyId, userId, tx);
      return tx.societyBrandPublication.findMany({ where: { societyId }, orderBy: { createdAt: 'desc' }, take: 50 });
    });
  }

  /** Never trust a client-supplied ID as ownership or a safety certificate. */
  private async requireVerifiedLogo(societyId: string, logoAssetId: string, tx: Prisma.TransactionClient) {
    const asset = await tx.societyBrandLogoAsset.findFirst({
      where: {
        id: logoAssetId, societyId, status: 'VERIFIED',
        sha256: { not: null }, verifiedAt: { not: null },
      },
      select: { id: true },
    });
    if (!asset) throw new ConflictException('Branding logo must be a verified asset owned by this society');
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
      if (config.logoAssetId) await this.requireVerifiedLogo(societyId, config.logoAssetId, tx);
      return tx.societyBrandRevision.create({
        data: { societyId, createdById: userId, version: input.expectedVersion + 1, config: config as Prisma.InputJsonValue, digest },
        select: { id: true, version: true, config: true, digest: true, publishedAt: true },
      });
    });
  }

  async publish(societyId: string, userId: string, revisionId: string, expectedPublishedVersion: number, reason = 'Publish society branding', restoredFromRevisionId?: string) {
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) throw new ConflictException('Publication reason required');
    if (!Number.isSafeInteger(expectedPublishedVersion) || expectedPublishedVersion < 0)
      throw new ConflictException('Expected published branding version is invalid');
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.requireEditor(societyId, userId, tx);
      await this.lockSociety(societyId, tx);
      const current = await tx.societyBrandRevision.findFirst({
        where: { societyId, publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
        select: { id: true, version: true },
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
      if (restoredFromRevisionId) {
        const original = await tx.societyBrandRevision.findFirst({ where: { id: restoredFromRevisionId, societyId, publishedAt: { not: null }, version: { lt: draft.version } } });
        if (!original || original.digest !== draft.digest || societyBrandDigest(validateSocietyBrandPresentation(original.config)) !== draft.digest)
          throw new ConflictException('Restore source differs from the published historical appearance');
      }
      if (config.logoAssetId) await this.requireVerifiedLogo(societyId, config.logoAssetId, tx);
      const result = await tx.societyBrandRevision.updateMany({
        where: { id: draft.id, societyId, publishedAt: null },
        data: { publishedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('Branding revision is no longer publishable');
      await tx.societyBrandPublication.create({ data: { societyId, revisionId: draft.id, publisherId: userId, reason: reason.trim(), previousRevisionId: current?.id ?? null, restoredFromRevisionId: restoredFromRevisionId ?? null } });
      return { id: draft.id, version: draft.version, revision: `society-${societyId}-v${draft.version}`, published: true };
    });
  }
}
