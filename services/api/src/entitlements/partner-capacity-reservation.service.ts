import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthPrincipal } from '../auth/auth.types';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { licensePhaseAt } from './partner-license-contract';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';

export type CapacityReservationInput = {
  grantId: string;
  expectedGrantVersion: number;
  expectedOwnershipVersion: number;
  expectedFeatures: ProductFeature[];
  idempotencyKey: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed = new Set<string>(Object.values(ProductFeature));
const sameFeatures = (a: unknown, b: ProductFeature[]) => Array.isArray(a) &&
  a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));

/** Real transaction-backed development reservation. DRAFT-only: no license
 * activation, entitlement cutover or operational authorization is supplied. */
@Injectable()
export class PartnerCapacityReservationService {
  constructor(private readonly ownership: SocietyOwnershipTransferService,
    private readonly entitlements: EntitlementService) {}

  async reserve(principal: AuthPrincipal, societyId: string, input: CapacityReservationInput) {
    if (!uuid.test(input.grantId) || !uuid.test(input.idempotencyKey) ||
        !Number.isSafeInteger(input.expectedGrantVersion) || input.expectedGrantVersion < 1 ||
        !Number.isSafeInteger(input.expectedOwnershipVersion) || input.expectedOwnershipVersion < 1 ||
        !Array.isArray(input.expectedFeatures) || new Set(input.expectedFeatures).size !== input.expectedFeatures.length ||
        input.expectedFeatures.some(f => !allowed.has(f))) throw new BadRequestException('Invalid capacity reservation');
    return this.ownership.withAuthorizedSociety(principal, societyId, async (tx, owner) => {
      if (owner.ownershipVersion !== input.expectedOwnershipVersion) throw new ConflictException('Ownership version changed');
      await tx.$queryRaw`SELECT "id" FROM "PartnerLicenseGrant" WHERE "id"=${input.grantId}::uuid FOR UPDATE`;
      const grant = await tx.partnerLicenseGrant.findFirst({
        where: { id: input.grantId, partnerId: owner.partnerId }, include: { planRevision: true },
      });
      if (!grant) throw new NotFoundException('License draft unavailable');
      const partners = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Partner"
        WHERE "id"=${owner.partnerId}::uuid FOR SHARE`;
      if (partners.length !== 1 || partners[0].status !== 'ACTIVE' || grant.status !== 'DRAFT' ||
          grant.version !== input.expectedGrantVersion || licensePhaseAt({ startsAt: grant.startsAt.toISOString(),
            endsAt: grant.endsAt.toISOString(), graceUntil: grant.graceUntil?.toISOString() }, new Date().toISOString()) !== 'ACTIVE') {
        throw new ConflictException('License reservation context changed');
      }
      const current = await this.entitlements.current(societyId, tx);
      const planFeatures = grant.planRevision.featureAllowlist;
      if (!current || !sameFeatures(input.expectedFeatures, current.enabledFeatures) ||
          !Array.isArray(planFeatures) || new Set(planFeatures).size !== planFeatures.length ||
          planFeatures.some(f => typeof f !== 'string' || !allowed.has(f)) ||
          current.enabledFeatures.some(f => !planFeatures.includes(f))) {
        throw new ConflictException('Legacy entitlement compatibility changed');
      }
      if (owner.ownershipVersion > 1) {
        const history = await tx.societyOwnershipTransfer.findUnique({
          where: { societyId_ownershipVersion: { societyId, ownershipVersion: owner.ownershipVersion } },
          include: { request: { select: { toPartnerId: true } } },
        });
        if (!history || history.request.toPartnerId !== owner.partnerId) throw new ConflictException('Ownership history unavailable');
      }
      // Reauthorization and compatibility checks always precede receipt replay.
      const replay = await tx.partnerLicenseCapacityReservation.findUnique({
        where: { grantId_idempotencyKey: { grantId: input.grantId, idempotencyKey: input.idempotencyKey } },
      });
      if (replay) {
        if (replay.societyId !== societyId || replay.actorId !== principal.userId ||
            replay.ownershipVersion !== owner.ownershipVersion || replay.grantVersion !== grant.version ||
            replay.planRevisionId !== grant.planRevisionId || !sameFeatures(replay.enabledFeatures, current.enabledFeatures)) {
          throw new ConflictException('Reservation key already used');
        }
        return { id: replay.id, mode: 'DRAFT_RESERVATION' as const, ownershipVersion: replay.ownershipVersion };
      }
      const duplicate = await tx.partnerLicenseCapacityReservation.findUnique({
        where: { grantId_societyId_ownershipVersion: { grantId: grant.id, societyId, ownershipVersion: owner.ownershipVersion } }, select: { id: true },
      });
      if (duplicate) throw new ConflictException('Society already reserved in this draft');
      const [capacity] = await tx.$queryRaw<{ used: number }[]>`SELECT count(*)::integer AS "used"
        FROM "PartnerLicenseCapacityReservation" r JOIN "Society" s ON s."id"=r."societyId"
        WHERE r."grantId"=${grant.id}::uuid AND s."partnerId"=${owner.partnerId}::uuid AND s."ownershipVersion"=r."ownershipVersion"`;
      if (!capacity || capacity.used >= grant.planRevision.maximumSocieties) throw new ConflictException('License capacity exhausted');
      const reservation = await tx.partnerLicenseCapacityReservation.create({
        data: { grantId: grant.id, planRevisionId: grant.planRevisionId, grantVersion: grant.version,
          societyId, ownershipVersion: owner.ownershipVersion, actorId: principal.userId,
          idempotencyKey: input.idempotencyKey, enabledFeatures: current.enabledFeatures }, select: { id: true },
      });
      return { id: reservation.id, mode: 'DRAFT_RESERVATION' as const, ownershipVersion: owner.ownershipVersion };
    });
  }
}
