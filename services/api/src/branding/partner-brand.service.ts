import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerRole, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalLicenseJson } from '../entitlements/partner-license-lifecycle.service';
import { SocietyBrandPresentation, validateSocietyBrandPresentation } from './branding-contract';
import { activePartnerAllocation } from './active-partner-allocation';

const fields = ['displayName', 'colors', 'support', 'logoAssetId'] as const;
type Field = typeof fields[number];
export type PartnerBrandConfig = { presentation: SocietyBrandPresentation; societyOverrideFields: Field[] };
export function partnerBrandConfig(value: unknown): PartnerBrandConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid partner brand');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || !('presentation' in v) || !Array.isArray(v.societyOverrideFields) ||
      new Set(v.societyOverrideFields).size !== v.societyOverrideFields.length ||
      v.societyOverrideFields.some(f => !fields.includes(f))) throw new BadRequestException('Invalid society override policy');
  const presentation = validateSocietyBrandPresentation(v.presentation);
  if (presentation.logoAssetId) throw new BadRequestException('Partner presentation cannot reference a society-private logo');
  return { presentation, societyOverrideFields: fields.filter(f => (v.societyOverrideFields as unknown[]).includes(f)) };
}
const digest = (v: unknown) => createHash('sha256').update(canonicalLicenseJson(v)).digest('hex');
export function mergePartnerPresentation(partner: PartnerBrandConfig, society: SocietyBrandPresentation): SocietyBrandPresentation {
  const result: Record<string, unknown> = { ...partner.presentation };
  for (const field of partner.societyOverrideFields) if (society[field] !== undefined) result[field] = society[field];
  return validateSocietyBrandPresentation(result);
}

@Injectable()
export class PartnerBrandService {
  constructor(private readonly prisma: PrismaService) {}
  async authorize(tx: Prisma.TransactionClient, actorId: string, partnerId: string, edit = false) {
    const member = await tx.partnerMembership.findFirst({ where: { userId: actorId, partnerId, active: true,
      role: { in: edit ? [PartnerRole.OWNER, PartnerRole.BRAND_MANAGER] : [PartnerRole.OWNER, PartnerRole.BRAND_MANAGER, PartnerRole.COMMERCIAL_ADMIN] },
      user: { is: { status: 'ACTIVE' } }, partner: { is: { status: 'ACTIVE' } } }, select: { id: true } });
    if (!member) throw new NotFoundException('Partner resource unavailable');
  }
  history(actorId: string, partnerId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(tx, actorId, partnerId);
      const [revisions, published] = await Promise.all([
        tx.partnerBrandRevision.findMany({ where: { partnerId }, orderBy: { version: 'desc' }, take: 50 }),
        tx.partnerBrandRevision.findFirst({ where: { partnerId, publishedAt: { not: null } }, orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }] }),
      ]);
      return { revisions, published, latestVersion: revisions[0]?.version ?? 0 };
    });
  }
  draft(actorId: string, partnerId: string, expectedVersion: number, input: unknown) {
    const config = partnerBrandConfig(input);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647) throw new BadRequestException('Invalid brand version');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
      await this.authorize(tx, actorId, partnerId, true);
      const latest = await tx.partnerBrandRevision.findFirst({ where: { partnerId }, orderBy: { version: 'desc' } });
      if ((latest?.version ?? 0) !== expectedVersion) throw new ConflictException('Partner branding changed; reload revisions');
      return tx.partnerBrandRevision.create({ data: { partnerId, version: expectedVersion + 1, config: config as Prisma.InputJsonValue, digest: digest(config), createdById: actorId } });
    });
  }
  publish(actorId: string, partnerId: string, revisionId: string, expectedPublishedVersion: number, reason: string) {
    if (!Number.isSafeInteger(expectedPublishedVersion) || expectedPublishedVersion < 0 || typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500)
      throw new BadRequestException('Publication version and reason required');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
      await this.authorize(tx, actorId, partnerId, true);
      const current = await tx.partnerBrandRevision.findFirst({ where: { partnerId, publishedAt: { not: null } }, orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }] });
      if ((current?.version ?? 0) !== expectedPublishedVersion) throw new ConflictException('Partner publication changed');
      const draft = await tx.partnerBrandRevision.findFirst({ where: { partnerId, id: revisionId, publishedAt: null } });
      if (!draft || draft.version <= expectedPublishedVersion) throw new NotFoundException('Publishable partner draft unavailable');
      const config = partnerBrandConfig(draft.config);
      if (digest(config) !== draft.digest) throw new ConflictException('Partner brand digest changed');
      await tx.partnerBrandRevision.update({ where: { id: draft.id }, data: { publishedAt: new Date(), publishedById: actorId, reason: reason.trim() } });
      return { version: draft.version, published: true };
    });
  }
  /** Caller already owns an authenticated society read. License consent remains independent. */
  async resolve(tx: Prisma.TransactionClient, society: { id: string; partnerId: string; ownershipVersion: number }, config: SocietyBrandPresentation) {
    if (!society.partnerId || !await activePartnerAllocation(tx, society.id, society.partnerId, society.ownershipVersion)) return { config, partnerVersion: 0 };
    const published = await tx.partnerBrandRevision.findFirst({ where: { partnerId: society.partnerId, publishedAt: { not: null } }, orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }] });
    if (!published) return { config, partnerVersion: 0 };
    try {
      const partner = partnerBrandConfig(published.config);
      if (digest(partner) !== published.digest) return { config, partnerVersion: 0 };
      return { config: mergePartnerPresentation(partner, config), partnerVersion: published.version };
    } catch { return { config, partnerVersion: 0 }; }
  }
}
