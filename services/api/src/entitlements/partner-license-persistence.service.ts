import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductFeature } from './entitlement.types';
import { licensePhaseAt } from './partner-license-contract';

export type NewLicensePlanRevision = {
  code: string;
  expectedVersion: number;
  featureAllowlist: ProductFeature[];
  maximumSocieties: number;
  maximumDomains: number;
  maximumDistributions: number;
};

export type NewLicenseGrantDraft = {
  planRevisionId: string;
  startsAt: string;
  endsAt: string;
  graceUntil?: string | null;
  idempotencyKey: string;
};

const codePattern = /^[A-Z][A-Z0-9_]{2,39}$/;
const allowed = new Set<string>(Object.values(ProductFeature));
const nonnegative = (value: number) => Number.isSafeInteger(value) && value >= 0;

/**
 * Platform-only commercial draft ledger. There is deliberately no grant,
 * activate, allocation or society entitlement write API in V5.4.3.
 */
@Injectable()
export class PartnerLicensePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    return this.prisma.partnerLicensePlanRevision.findMany({
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      take: 100,
      select: {
        id: true, code: true, version: true, featureAllowlist: true,
        maximumSocieties: true, maximumDomains: true,
        maximumDistributions: true, createdAt: true,
      },
    });
  }

  async createPlanRevision(actorId: string, input: NewLicensePlanRevision) {
    if (!codePattern.test(input.code) ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
        !Array.isArray(input.featureAllowlist) ||
        input.featureAllowlist.some(feature => !allowed.has(feature)) ||
        new Set(input.featureAllowlist).size !== input.featureAllowlist.length ||
        !nonnegative(input.maximumSocieties) || !nonnegative(input.maximumDomains) ||
        !nonnegative(input.maximumDistributions)) {
      throw new BadRequestException('Invalid commercial plan revision');
    }
    return this.prisma.$transaction(async tx => {
      // Per-plan monotonic numbering; two concurrent platform operators cannot
      // both create the next revision after observing the same prior version.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.code}))`;
      const previous = await tx.partnerLicensePlanRevision.findFirst({
        where: { code: input.code },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if ((previous?.version ?? 0) !== input.expectedVersion) {
        throw new ConflictException('Commercial plan version changed');
      }
      return tx.partnerLicensePlanRevision.create({
        data: {
          code: input.code, version: input.expectedVersion + 1,
          featureAllowlist: input.featureAllowlist,
          maximumSocieties: input.maximumSocieties,
          maximumDomains: input.maximumDomains,
          maximumDistributions: input.maximumDistributions,
          createdById: actorId,
        },
        select: {
          id: true, code: true, version: true, featureAllowlist: true,
          maximumSocieties: true, maximumDomains: true,
          maximumDistributions: true, createdAt: true,
        },
      });
    });
  }

  async listPartnerDrafts(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId }, select: { id: true },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    return this.prisma.partnerLicenseGrant.findMany({
      where: { partnerId, status: 'DRAFT' },
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, planRevisionId: true, startsAt: true,
        endsAt: true, graceUntil: true, version: true, createdAt: true,
      },
    });
  }

  async createGrantDraft(actorId: string, partnerId: string, input: NewLicenseGrantDraft) {
    let startsAt: Date, endsAt: Date, graceUntil: Date | null;
    try {
      licensePhaseAt(input, input.startsAt); // strict UTC and interval validation
      startsAt = new Date(input.startsAt);
      endsAt = new Date(input.endsAt);
      graceUntil = input.graceUntil ? new Date(input.graceUntil) : null;
    } catch {
      throw new BadRequestException('Invalid grant period');
    }
    const sameRequest = (item: {
      createdById: string; planRevisionId: string;
      startsAt: Date; endsAt: Date; graceUntil: Date | null;
    }) => item.createdById === actorId && item.planRevisionId === input.planRevisionId &&
      item.startsAt.getTime() === startsAt.getTime() &&
      item.endsAt.getTime() === endsAt.getTime() &&
      (item.graceUntil?.getTime() ?? null) === (graceUntil?.getTime() ?? null);

    const existing = await this.prisma.partnerLicenseGrant.findUnique({
      where: { partnerId_idempotencyKey: { partnerId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (!sameRequest(existing)) throw new ConflictException('Grant request key already used');
      return { id: existing.id, status: existing.status, version: existing.version };
    }
    try {
      return await this.prisma.$transaction(async tx => {
        const [partner, revision] = await Promise.all([
          tx.partner.findUnique({ where: { id: partnerId }, select: { status: true } }),
          tx.partnerLicensePlanRevision.findUnique({
            where: { id: input.planRevisionId }, select: { id: true },
          }),
        ]);
        if (!partner) throw new NotFoundException('Partner not found');
        if (partner.status !== 'ACTIVE') throw new ForbiddenException('Inactive partner');
        if (!revision) throw new NotFoundException('Plan revision not found');
        const draft = await tx.partnerLicenseGrant.create({
          data: {
            partnerId, planRevisionId: revision.id, status: 'DRAFT',
            startsAt, endsAt, graceUntil, idempotencyKey: input.idempotencyKey,
            createdById: actorId,
          },
          select: { id: true, status: true, version: true },
        });
        await tx.partnerLicenseEvent.create({
          data: {
            grantId: draft.id, actorId, type: 'DRAFT_CREATED',
            idempotencyKey: input.idempotencyKey, detail: {},
          },
        });
        return draft;
      });
    } catch (error) {
      // A concurrent replay may race the first unique insert: return only the
      // original identical draft, never silently accept a mismatched request.
      const replay = await this.prisma.partnerLicenseGrant.findUnique({
        where: { partnerId_idempotencyKey: { partnerId, idempotencyKey: input.idempotencyKey } },
      });
      if (replay) {
        if (!sameRequest(replay)) throw new ConflictException('Grant request key already used');
        return { id: replay.id, status: replay.status, version: replay.version };
      }
      throw error;
    }
  }
}
