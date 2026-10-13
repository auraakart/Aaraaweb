import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppRole, AuthPrincipal } from '../auth/auth.types';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';

export type OwnershipProposal = {
  toPartnerId: string;
  expectedOwnershipVersion: number;
  idempotencyKey: string;
  reason: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Platform operators must also have a current SUPER_ADMIN membership in the
 * selected society. Commercial ownership never creates operational authority.
 * Proposal + independent approval preserves tier, overrides and all memberships.
 */
@Injectable()
export class SocietyOwnershipTransferService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(principal: AuthPrincipal, societyId: string) {
    if (!uuid.test(societyId) || !uuid.test(principal.userId) ||
        principal.societyId !== societyId || !principal.roles.includes(AppRole.SUPER_ADMIN)) {
      throw new ForbiddenException('Ownership authority unavailable');
    }
  }

  private async authority(tx: Prisma.TransactionClient, actorId: string, societyId: string) {
    // SHARE locks prevent revocation/status writes between authorization and commit.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT u."id" FROM "User" u
      JOIN "SocietyMembership" m ON m."userId"=u."id"
      WHERE u."id"=${actorId}::uuid AND u."status"='ACTIVE'
      AND m."societyId"=${societyId}::uuid AND m."active"=true AND m."role"='SUPER_ADMIN'
      FOR SHARE OF u, m`;
    if (!rows.length) throw new ForbiddenException('Ownership authority unavailable');
  }

  private async society(tx: Prisma.TransactionClient, societyId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`;
    const society = await tx.society.findUnique({
      where: { id: societyId }, select: { partnerId: true, ownershipVersion: true, status: true },
    });
    if (!society || society.status !== 'ACTIVE') throw new NotFoundException('Society unavailable');
    return society;
  }

  private async partners(tx: Prisma.TransactionClient, from: string, to: string) {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`SELECT "id", "status" FROM "Partner"
      WHERE "id" IN (${from}::uuid, ${to}::uuid) ORDER BY "id" FOR SHARE`;
    if (from === to || rows.length !== 2 || rows.some(row => row.status !== 'ACTIVE')) {
      throw new ConflictException('Ownership partners unavailable');
    }
  }

  /** Reuse the same locked live authority for commercial reservation work.
   * The callback cannot treat partner ownership as an operational role. */
  async withAuthorizedSociety<T>(principal: AuthPrincipal, societyId: string,
    operation: (tx: Prisma.TransactionClient, current: { partnerId: string; ownershipVersion: number }) => Promise<T>): Promise<T> {
    this.scope(principal, societyId);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${societyId}, true)`;
      const current = await this.society(tx, societyId);
      await this.authority(tx, principal.userId, societyId);
      return operation(tx, current);
    });
  }

  async propose(principal: AuthPrincipal, societyId: string, input: OwnershipProposal) {
    this.scope(principal, societyId);
    if (!uuid.test(input.toPartnerId) || !uuid.test(input.idempotencyKey) ||
        !Number.isSafeInteger(input.expectedOwnershipVersion) || input.expectedOwnershipVersion < 1 ||
        input.expectedOwnershipVersion >= 2147483647 || typeof input.reason !== 'string' ||
        !input.reason.trim() || input.reason.trim().length > 500) {
      throw new BadRequestException('Invalid ownership proposal');
    }
    const reason = input.reason.trim();
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${societyId}, true)`;
      const current = await this.society(tx, societyId);
      await this.authority(tx, principal.userId, societyId);
      const existing = await tx.societyOwnershipTransferRequest.findUnique({
        where: { societyId_idempotencyKey: { societyId, idempotencyKey: input.idempotencyKey } },
        include: { transfer: true },
      });
      if (existing) {
        if (existing.initiatedById !== principal.userId || existing.toPartnerId !== input.toPartnerId ||
            existing.expectedOwnershipVersion !== input.expectedOwnershipVersion || existing.reason !== reason) {
          throw new ConflictException('Ownership proposal key already used');
        }
        await this.partners(tx, existing.fromPartnerId, existing.toPartnerId);
        const expectedPartner = existing.transfer ? existing.toPartnerId : existing.fromPartnerId;
        const expectedVersion = existing.transfer?.ownershipVersion ?? existing.expectedOwnershipVersion;
        if (current.partnerId !== expectedPartner || current.ownershipVersion !== expectedVersion) {
          throw new ConflictException('Ownership version changed');
        }
        return { id: existing.id, applied: Boolean(existing.transfer) };
      }
      if (current.ownershipVersion !== input.expectedOwnershipVersion) throw new ConflictException('Ownership version changed');
      await this.partners(tx, current.partnerId, input.toPartnerId);
      const proposal = await tx.societyOwnershipTransferRequest.create({
        data: { societyId, fromPartnerId: current.partnerId, toPartnerId: input.toPartnerId,
          expectedOwnershipVersion: input.expectedOwnershipVersion, initiatedById: principal.userId,
          idempotencyKey: input.idempotencyKey, reason }, select: { id: true },
      });
      return { id: proposal.id, applied: false };
    });
  }

  async approve(principal: AuthPrincipal, societyId: string, requestId: string) {
    this.scope(principal, societyId);
    if (!uuid.test(requestId)) throw new BadRequestException('Invalid ownership request');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${societyId}, true)`;
      const current = await this.society(tx, societyId);
      await this.authority(tx, principal.userId, societyId);
      const proposal = await tx.societyOwnershipTransferRequest.findFirst({
        where: { id: requestId, societyId }, include: { transfer: true },
      });
      if (!proposal) throw new NotFoundException('Ownership request unavailable');
      if (proposal.initiatedById === principal.userId) throw new ForbiddenException('Independent ownership approval required');
      await this.authority(tx, proposal.initiatedById, societyId);
      await this.partners(tx, proposal.fromPartnerId, proposal.toPartnerId);
      if (proposal.transfer) {
        if (proposal.transfer.approvedById !== principal.userId || current.partnerId !== proposal.toPartnerId ||
            current.ownershipVersion !== proposal.transfer.ownershipVersion) throw new ConflictException('Ownership approval changed');
        return { id: proposal.transfer.id, ownershipVersion: proposal.transfer.ownershipVersion, applied: true };
      }
      if (current.partnerId !== proposal.fromPartnerId || current.ownershipVersion !== proposal.expectedOwnershipVersion) {
        throw new ConflictException('Ownership version changed');
      }
      const ownershipVersion = proposal.expectedOwnershipVersion + 1;
      const transfer = await tx.societyOwnershipTransfer.create({
        data: { requestId, societyId, ownershipVersion, approvedById: principal.userId }, select: { id: true },
      });
      const changed = await tx.society.updateMany({
        where: { id: societyId, partnerId: proposal.fromPartnerId, ownershipVersion: proposal.expectedOwnershipVersion },
        data: { partnerId: proposal.toPartnerId, ownershipVersion },
      });
      if (changed.count !== 1) throw new ConflictException('Ownership version changed');
      return { id: transfer.id, ownershipVersion, applied: true };
    });
  }
}
