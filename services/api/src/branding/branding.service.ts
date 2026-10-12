import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
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
  private requireSociety(principal: AuthPrincipal | undefined): {societyId:string;userId:string} {
    if (!principal?.userId) throw new UnauthorizedException('Authentication required');
    if (!principal.societyId) throw new ForbiddenException('Society branding editor requires a society');
    return {societyId:principal.societyId,userId:principal.userId};
  }

  private expectedVersion(value: unknown): number | null {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      throw new BadRequestException('Expected branding version must be a positive integer or null');
    }
    return value;
  }

  private assertKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Invalid branding operation');
    }
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(k=>!keys.includes(k)) || keys.some(k=>!(k in row))) {
      throw new BadRequestException('Unsupported branding operation fields');
    }
    return row;
  }

  // A society row lock serializes version allocation/publish/rollback while a
  // role row FOR SHARE prevents concurrent membership revocation during writes.
  private async edit<T>(
    principal: AuthPrincipal | undefined,
    operation: (tx: Prisma.TransactionClient, societyId: string, userId: string) => Promise<T>,
  ): Promise<T> {
    const { societyId, userId } = this.requireSociety(principal);
    return this.prisma.withTenantContext(societyId, async tx => {
      const society = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "Society"
        WHERE "id"=${societyId}::uuid AND "status"='ACTIVE'
        LIMIT 1 FOR UPDATE
      `);
      if (!society.length) throw new ForbiddenException('Society branding editor is unavailable');
      const roles = await tx.$queryRaw<Array<{role:string}>>(Prisma.sql`
        SELECT "role"::text AS "role" FROM "SocietyMembership"
        WHERE "userId"=${userId}::uuid AND "societyId"=${societyId}::uuid
          AND "active"=TRUE AND "role" IN ('SOCIETY_ADMIN','SUPER_ADMIN')
        FOR SHARE
      `);
      if (!roles.length) throw new ForbiddenException('Society branding editor access denied');
      return operation(tx, societyId, userId);
    });
  }

  private async versions(tx: Prisma.TransactionClient, societyId:string) {
    const [latest, published] = await Promise.all([
      tx.societyBrandRevision.findFirst({
        where:{societyId},orderBy:{version:'desc'},
        select:{version:true,id:true},
      }),
      tx.societyBrandRevision.findFirst({
        where:{societyId,publishedAt:{not:null}},
        orderBy:[{publishedAt:'desc'},{version:'desc'}],
        select:{version:true,id:true},
      }),
    ]);
    return { latest:latest?.version??null, published:published?.version??null, publishedId:published?.id??null };
  }

  async createDraft(principal:AuthPrincipal|undefined, body:unknown) {
    const input=this.assertKeys(body,['config','expectedLatestVersion','expectedPublishedVersion']);
    const config=validateSocietyBrandPresentation(input.config);
    const latestExpected=this.expectedVersion(input.expectedLatestVersion);
    const publishedExpected=this.expectedVersion(input.expectedPublishedVersion);
    return this.edit(principal,async(tx,societyId,userId)=>{
      const versions=await this.versions(tx,societyId);
      if (versions.latest!==latestExpected || versions.published!==publishedExpected) {
        throw new ConflictException('Society branding has changed; refresh revision history');
      }
      const nextVersion=(versions.latest??0)+1;
      return tx.societyBrandRevision.create({data:{
        societyId,version:nextVersion,createdById:userId,
        schemaVersion:1,config:config as Prisma.InputJsonValue,digest:societyBrandDigest(config),
      }});
    });
  }

  async publishDraft(principal:AuthPrincipal|undefined, body:unknown) {
    const input=this.assertKeys(body,['revisionId','expectedPublishedVersion']);
    if (typeof input.revisionId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.revisionId)) {
      throw new BadRequestException('Invalid brand revision identifier');
    }
    const expected=this.expectedVersion(input.expectedPublishedVersion);
    return this.edit(principal,async(tx,societyId)=>{
      const target=await tx.societyBrandRevision.findFirst({where:{id:input.revisionId as string,societyId}});
      if (!target) throw new NotFoundException('Society brand revision not found');
      const versions=await this.versions(tx,societyId);
      if (target.publishedAt && versions.publishedId===target.id) return target;
      if (versions.published!==expected || versions.latest!==target.version || target.publishedAt) {
        throw new ConflictException('Society branding has changed; refresh revision history');
      }
      const config=validateSocietyBrandPresentation(target.config);
      if (societyBrandDigest(config)!==target.digest) throw new BadRequestException('Brand revision digest mismatch');
      return tx.societyBrandRevision.update({
        where:{id:target.id,societyId},data:{publishedAt:new Date()},
      });
    });
  }

  async restorePublished(principal:AuthPrincipal|undefined, body:unknown) {
    const input=this.assertKeys(body,['sourceVersion','expectedPublishedVersion','expectedLatestVersion']);
    const targetVersion=this.expectedVersion(input.sourceVersion);
    if (targetVersion===null) throw new BadRequestException('Source branding version is required');
    const expectedPublished=this.expectedVersion(input.expectedPublishedVersion);
    const expectedLatest=this.expectedVersion(input.expectedLatestVersion);
    return this.edit(principal,async(tx,societyId,userId)=>{
      const versions=await this.versions(tx,societyId);
      if (versions.published!==expectedPublished || versions.latest!==expectedLatest) {
        throw new ConflictException('Society branding has changed; refresh revision history');
      }
      const source=await tx.societyBrandRevision.findFirst({
        where:{societyId,version:targetVersion,publishedAt:{not:null}},
      });
      if (!source) throw new NotFoundException('Published society brand revision not found');
      const config=validateSocietyBrandPresentation(source.config);
      if (societyBrandDigest(config)!==source.digest) throw new BadRequestException('Brand revision digest mismatch');
      return tx.societyBrandRevision.create({data:{
        societyId,createdById:userId,version:(versions.latest??0)+1,
        schemaVersion:1,config:config as Prisma.InputJsonValue,digest:societyBrandDigest(config),
        publishedAt:new Date(),
      }});
    });
  }

  async listRevisions(principal:AuthPrincipal|undefined) {
    return this.edit(principal,async(tx,societyId)=>{
      const [versions, history] = await Promise.all([
        this.versions(tx,societyId),
        tx.societyBrandRevision.findMany({
          where:{societyId},orderBy:{version:'desc'},take:30,
          select:{id:true,version:true,config:true,digest:true,publishedAt:true,createdAt:true,createdById:true},
        }),
      ]);
      return {societyId,latestVersion:versions.latest,publishedVersion:versions.published,revisions:history};
    });
  }

}
