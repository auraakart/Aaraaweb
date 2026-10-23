import { PartnerBrandService } from './partner-brand.service';
import { ForbiddenException, Injectable, Inject, NotFoundException, UnauthorizedException, PreconditionFailedException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { AuthPrincipal } from '../auth/auth.types';
import { PRIVATE_OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { societyBrandDigest, validateSocietyBrandPresentation } from './branding-contract';
import { MAX_SOCIETY_LOGO_BYTES, validateSocietyLogoPng } from './society-logo-validation';

/**
 * Read the *currently published* logo for the authenticated society only.
 * There is deliberately no object ID, society selector or public URL input.
 */
@Injectable()
export class PublishedBrandLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: PrismaMembershipRepository,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Optional() private readonly partnerBrands?: PartnerBrandService,
  ) {}

  async readPublished(principal: AuthPrincipal | undefined, expectedRevision?: string): Promise<Buffer> {
    if (!principal?.userId) throw new UnauthorizedException('Authentication required');
    if (!principal.societyId) throw new ForbiddenException('A selected society is required');
    const societyId = principal.societyId;
    const selected = await this.prisma.withTenantContext(societyId, async tx => {
      const memberships = await this.memberships.findActiveByUserAndSociety(principal.userId, societyId, tx);
      if (!memberships.length) throw new ForbiddenException('Current society membership required');
      const society = await tx.society.findFirst({
        where: { id: societyId, status: 'ACTIVE' }, select: { id: true, partnerId: true, ownershipVersion: true },
      });
      if (!society) throw new ForbiddenException('Active society required');
      const published = await tx.societyBrandRevision.findFirst({
        where: { societyId, publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
        select: { version: true, config: true, digest: true },
      });
      let config: import('./branding-contract').SocietyBrandPresentation = {};
      let societyVersion = 0;
      if (published) {
        try {
          const candidate = validateSocietyBrandPresentation(published.config);
          if (societyBrandDigest(candidate) === published.digest) { config = candidate; societyVersion = published.version; }
        } catch { /* Fail closed for corrupt presentation. */ }
      }
      const effective = this.partnerBrands ? await this.partnerBrands.resolve(tx, society, config) : { config, partnerVersion: 0 };
      const revision = `society-${societyId}-v${societyVersion}${effective.partnerVersion ? '-p' + effective.partnerVersion : ''}`;
      if (expectedRevision !== undefined && expectedRevision !== revision)
        throw new PreconditionFailedException('Published branding changed; refresh the current theme');
      if (!effective.config.logoAssetId) return null;
      try {
        const config = effective.config;
        return tx.societyBrandLogoAsset.findFirst({
          where: {
            id: config.logoAssetId, societyId, status: 'VERIFIED',
            sha256: { not: null }, verifiedAt: { not: null },
          },
          select: {
            storageKey: true, contentType: true, contentLengthBytes: true,
            sha256: true, uploadExpiresAt: true,
          },
        });
      } catch {
        // Corrupt/tainted published config never emits asset bytes.
        return null;
      }
    });

    if (!selected || selected.contentType !== 'image/png' ||
        !selected.sha256 || !/^[a-f0-9]{64}$/.test(selected.sha256) ||
        !Number.isInteger(selected.contentLengthBytes) ||
        selected.contentLengthBytes < 57 || selected.contentLengthBytes > MAX_SOCIETY_LOGO_BYTES ||
        selected.uploadExpiresAt.getTime() > Date.now() ||
        !new RegExp('^societies/' + societyId +
          '/branding/logos/[a-f0-9-]{36}\\.png$').test(selected.storageKey)) {
      throw new NotFoundException('No published logo for the selected society');
    }

    const metadata = await this.storage.headObject(selected.storageKey);
    if (!metadata || metadata.contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'image/png' ||
        metadata.contentLengthBytes !== selected.contentLengthBytes) {
      throw new NotFoundException('Published logo is unavailable');
    }
    const bytes = await this.storage.getObjectBytes(selected.storageKey, MAX_SOCIETY_LOGO_BYTES);
    if (!bytes || bytes.byteLength !== selected.contentLengthBytes) {
      throw new NotFoundException('Published logo is unavailable');
    }
    try {
      if (validateSocietyLogoPng(bytes).sha256 !== selected.sha256) {
        throw new NotFoundException('Published logo has changed');
      }
    } catch {
      throw new NotFoundException('Published logo failed integrity verification');
    }
    return Buffer.from(bytes);
  }
}
