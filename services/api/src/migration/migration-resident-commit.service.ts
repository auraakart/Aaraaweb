import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma, UnitRelation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ResidentBatch = {
  id: string;
  status: string;
  totalRows: number;
  committedAt: Date | null;
};
type ResidentRow = {
  id: string;
  rowNumber: number;
  normalized: Record<string, string>;
  valid: boolean;
  targetId: string | null;
};
type ArtifactRow = {
  artifactType: string;
  artifactId: string;
  createdByMigration: boolean;
  metadata: Record<string, unknown> | null;
};

@Injectable()
export class MigrationResidentCommitService {
  constructor(private readonly prisma: PrismaService) {}

  supports(entityType: string) {
    return entityType === 'RESIDENT';
  }

  async commit(societyId: string, actorUserId: string, batchId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (batch.status !== 'READY') throw new ConflictException('Only a READY resident migration batch can be committed');

      const rows = await this.loadRows(tx, batchId);
      if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || row.targetId)) {
        throw new ConflictException('Resident migration rows are not in a clean commit-ready state');
      }

      for (const row of rows) {
        await this.commitRow(tx, societyId, row);
      }

      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='COMMITTED',"committedAt"=CURRENT_TIMESTAMP,
            "committedByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='RESIDENT'
        RETURNING *
      `);
      if (!updated[0]) throw new ConflictException('Resident migration batch could not be committed');
      return updated[0];
    }).catch((error) => this.translateConflict(error));
  }

  async rollback(societyId: string, actorUserId: string, batchId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (batch.status !== 'COMMITTED' || !batch.committedAt) {
        throw new ConflictException('Only a COMMITTED resident migration batch can be rolled back');
      }

      const artifacts = await tx.$queryRaw<ArtifactRow[]>(Prisma.sql`
        SELECT a."artifactType",a."artifactId",a."createdByMigration",a."metadata"
        FROM "MigrationBatchArtifact" a
        JOIN "MigrationBatchRow" r ON r."id"=a."rowId"
        WHERE r."batchId"=${batchId}::uuid
        ORDER BY a."createdAt" DESC
      `);
      if (!artifacts.length) throw new ConflictException('Resident migration artifact evidence is missing');

      const created = (type: string) => artifacts
        .filter((item) => item.artifactType === type && item.createdByMigration)
        .map((item) => item.artifactId);
      const userIds = [...new Set(artifacts.filter((item) => item.artifactType === 'USER').map((item) => item.artifactId))];
      const occupancyIds = created('UNIT_OCCUPANCY');
      const ownershipIds = created('UNIT_OWNERSHIP');
      const membershipIds = created('SOCIETY_MEMBERSHIP');
      const householdIds = created('HOUSEHOLD');
      const createdUserIds = created('USER');

      await this.assertNoPostMigrationUsage(tx, societyId, userIds, batch.committedAt);
      await this.assertCreatedMembershipsRemainDisposable(
        tx,
        societyId,
        artifacts.filter((item) => item.artifactType === 'SOCIETY_MEMBERSHIP' && item.createdByMigration),
        ownershipIds,
        occupancyIds,
      );
      await this.assertHouseholdsRemainDisposable(tx, societyId, householdIds);

      if (occupancyIds.length) await tx.unitOccupancy.deleteMany({ where: { societyId, id: { in: occupancyIds } } });
      if (ownershipIds.length) await tx.unitOwnership.deleteMany({ where: { societyId, id: { in: ownershipIds } } });
      if (membershipIds.length) await tx.societyMembership.deleteMany({ where: { societyId, id: { in: membershipIds } } });
      if (householdIds.length) await tx.household.deleteMany({ where: { societyId, id: { in: householdIds } } });

      for (const userId of createdUserIds) {
        const [memberships, ownerships, occupancies, sessions, devices] = await Promise.all([
          tx.societyMembership.count({ where: { userId } }),
          tx.unitOwnership.count({ where: { userId } }),
          tx.unitOccupancy.count({ where: { userId } }),
          tx.session.count({ where: { userId } }),
          tx.devicePushToken.count({ where: { userId } }),
        ]);
        if (memberships + ownerships + occupancies + sessions + devices > 0) {
          throw new ConflictException('Resident rollback is blocked because a migration-created user gained additional account relationships');
        }
        await tx.user.delete({ where: { id: userId } });
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchArtifact" a
        SET "rolledBackAt"=CURRENT_TIMESTAMP
        FROM "MigrationBatchRow" r
        WHERE a."rowId"=r."id" AND r."batchId"=${batchId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow" SET "rolledBackAt"=CURRENT_TIMESTAMP
        WHERE "batchId"=${batchId}::uuid
      `);
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='ROLLED_BACK',"rolledBackAt"=CURRENT_TIMESTAMP,
            "rolledBackByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='RESIDENT'
        RETURNING *
      `);
      return updated[0];
    });
  }

  private async commitRow(tx: Prisma.TransactionClient, societyId: string, row: ResidentRow) {
    const name = this.value(row.normalized, 'name');
    const phone = this.value(row.normalized, 'phone', 'mobile', 'mobile_number');
    const relation = this.value(row.normalized, 'occupancy_type', 'resident_type', 'role').toUpperCase() as UnitRelation;
    const unitRef = this.value(row.normalized, 'unit_ref', 'unit', 'flat_number');
    const isOccupant = this.booleanValue(row.normalized, ['is_occupant'], true);
    const ownershipVerified = this.booleanValue(row.normalized, ['ownership_verified', 'verified_owner'], false);
    if (!name || !phone || !unitRef || !relation) throw new BadRequestException('Resident migration row is missing required canonical fields');
    if (relation !== UnitRelation.OWNER && !isOccupant) {
      throw new BadRequestException('Tenant and family resident migration rows must be active occupants');
    }

    const unit = await this.resolveUnit(tx, societyId, unitRef);
    let user = await tx.user.findUnique({ where: { phone } });
    const userCreated = !user;
    if (!user) user = await tx.user.create({ data: { phone, name } });
    await this.recordArtifact(tx, row.id, 'USER', user.id, userCreated, { phone });

    const [existingOwnership, existingOccupancy] = await Promise.all([
      tx.unitOwnership.findFirst({ where: { societyId, unitId: unit.id, userId: user.id, active: true } }),
      tx.unitOccupancy.findFirst({ where: { societyId, unitId: unit.id, userId: user.id, active: true } }),
    ]);
    if (existingOwnership || existingOccupancy) {
      throw new ConflictException('Resident migration does not overwrite an existing active unit relationship');
    }

    const role = relation as unknown as MembershipRole;
    const membership = await tx.societyMembership.findUnique({
      where: { userId_societyId_role: { userId: user.id, societyId, role } },
    });
    if (membership && !membership.active) {
      throw new ConflictException('Inactive historical resident membership requires manual review before migration');
    }
    const activeMembership = membership ?? await tx.societyMembership.create({
      data: { userId: user.id, societyId, role, active: true },
    });
    await this.recordArtifact(tx, row.id, 'SOCIETY_MEMBERSHIP', activeMembership.id, !membership, {
      userId: user.id,
      role,
    });

    if (relation === UnitRelation.OWNER) {
      const ownership = await tx.unitOwnership.create({
        data: { societyId, unitId: unit.id, userId: user.id, verified: ownershipVerified },
      });
      await this.recordArtifact(tx, row.id, 'UNIT_OWNERSHIP', ownership.id, true, {
        userId: user.id,
        unitId: unit.id,
        role: 'OWNER',
      });
    }

    if (isOccupant) {
      const activeOccupants = await tx.unitOccupancy.count({ where: { societyId, unitId: unit.id, active: true } });
      const requestedPrimary = this.optionalBoolean(row.normalized, ['primary_gate_contact']);
      const existingPrimary = requestedPrimary === true
        ? await tx.unitOccupancy.count({ where: { societyId, unitId: unit.id, active: true, primaryGateContact: true } })
        : 0;
      if (requestedPrimary === true && existingPrimary > 0) {
        throw new ConflictException('Resident migration cannot replace an existing primary gate contact');
      }
      const primaryGateContact = activeOccupants === 0 ? true : (requestedPrimary ?? false);
      const occupancy = await tx.unitOccupancy.create({
        data: {
          societyId,
          unitId: unit.id,
          userId: user.id,
          relation,
          primaryGateContact,
          gateApprovalEnabled: this.booleanValue(row.normalized, ['gate_approval_enabled'], true),
          gateNotificationEnabled: primaryGateContact
            ? true
            : this.booleanValue(row.normalized, ['gate_notification_enabled'], true),
          escalationOrder: this.integerValue(row.normalized, ['escalation_order'], 100),
        },
      });
      await this.recordArtifact(tx, row.id, 'UNIT_OCCUPANCY', occupancy.id, true, {
        userId: user.id,
        unitId: unit.id,
        role: relation,
      });
    }

    const existingHousehold = await tx.household.findUnique({ where: { unitId: unit.id } });
    const household = existingHousehold ?? await tx.household.create({
      data: { societyId, unitId: unit.id, displayName: this.optional(row.normalized, 'household_name') },
    });
    await this.recordArtifact(tx, row.id, 'HOUSEHOLD', household.id, !existingHousehold, { unitId: unit.id });

    await tx.$executeRaw(Prisma.sql`
      UPDATE "MigrationBatchRow"
      SET "targetType"='ResidentRelationship',"targetId"=${user.id}::uuid,"committedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${row.id}::uuid
    `);
  }

  private async assertNoPostMigrationUsage(
    tx: Prisma.TransactionClient,
    societyId: string,
    userIds: string[],
    committedAt: Date,
  ) {
    if (!userIds.length) return;
    const ids = Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`));
    const rows = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "Visitor" WHERE "societyId"=${societyId}::uuid AND "hostUserId" IN (${ids}) AND "createdAt" >= ${committedAt}
        UNION ALL SELECT 1 FROM "AccessRequest" WHERE "societyId"=${societyId}::uuid AND "requestedById" IN (${ids}) AND "createdAt" >= ${committedAt}
        UNION ALL SELECT 1 FROM "ServiceBooking" WHERE "societyId"=${societyId}::uuid AND "residentUserId" IN (${ids}) AND "createdAt" >= ${committedAt}
        UNION ALL SELECT 1 FROM "HelpdeskTicket" WHERE "societyId"=${societyId}::uuid AND "createdById" IN (${ids}) AND "createdAt" >= ${committedAt}
        UNION ALL SELECT 1 FROM "SosIncident" WHERE "societyId"=${societyId}::uuid AND "residentUserId" IN (${ids}) AND "createdAt" >= ${committedAt}
        UNION ALL SELECT 1 FROM "Payment" WHERE "societyId"=${societyId}::uuid AND "payerUserId" IN (${ids}) AND "createdAt" >= ${committedAt}
        UNION ALL SELECT 1 FROM "HouseholdChangeRequest" WHERE "societyId"=${societyId}::uuid AND "requestedByUserId" IN (${ids}) AND "createdAt" >= ${committedAt}
      ) AS "blocked"
    `);
    if (rows[0]?.blocked) {
      throw new ConflictException('Resident rollback is blocked because migrated residents have post-migration operational activity');
    }
  }

  private async assertCreatedMembershipsRemainDisposable(
    tx: Prisma.TransactionClient,
    societyId: string,
    memberships: ArtifactRow[],
    ownershipIds: string[],
    occupancyIds: string[],
  ) {
    for (const membership of memberships) {
      const userId = String(membership.metadata?.userId ?? '');
      const role = String(membership.metadata?.role ?? '');
      if (!userId || !role) throw new ConflictException('Resident migration membership evidence is incomplete');
      if (role === 'OWNER') {
        const count = await tx.unitOwnership.count({
          where: { societyId, userId, active: true, ...(ownershipIds.length ? { id: { notIn: ownershipIds } } : {}) },
        });
        if (count) throw new ConflictException('Resident rollback is blocked because the owner membership now supports another ownership');
      } else {
        const count = await tx.unitOccupancy.count({
          where: {
            societyId,
            userId,
            active: true,
            relation: role as UnitRelation,
            ...(occupancyIds.length ? { id: { notIn: occupancyIds } } : {}),
          },
        });
        if (count) throw new ConflictException('Resident rollback is blocked because the membership now supports another occupancy');
      }
    }
  }

  private async assertHouseholdsRemainDisposable(tx: Prisma.TransactionClient, societyId: string, householdIds: string[]) {
    if (!householdIds.length) return;
    const [vehicles, contacts, workforce, changes] = await Promise.all([
      tx.householdVehicle.count({ where: { societyId, householdId: { in: householdIds } } }),
      tx.emergencyContact.count({ where: { societyId, householdId: { in: householdIds } } }),
      tx.workforceAssignment.count({ where: { societyId, householdId: { in: householdIds } } }),
      tx.householdChangeRequest.count({ where: { societyId, householdId: { in: householdIds } } }),
    ]);
    if (vehicles + contacts + workforce + changes > 0) {
      throw new ConflictException('Resident rollback is blocked because a migration-created household is now in use');
    }
  }

  private async recordArtifact(
    tx: Prisma.TransactionClient,
    rowId: string,
    artifactType: string,
    artifactId: string,
    createdByMigration: boolean,
    metadata: Record<string, unknown>,
  ) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchArtifact" ("rowId","artifactType","artifactId","createdByMigration","metadata")
      VALUES (${rowId}::uuid,${artifactType},${artifactId}::uuid,${createdByMigration},CAST(${JSON.stringify(metadata)} AS jsonb))
    `);
  }

  private async loadBatchForUpdate(tx: Prisma.TransactionClient, societyId: string, batchId: string) {
    const rows = await tx.$queryRaw<ResidentBatch[]>(Prisma.sql`
      SELECT "id","status","totalRows","committedAt"
      FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='RESIDENT'
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Resident migration batch not found');
    return rows[0];
  }

  private loadRows(tx: Prisma.TransactionClient, batchId: string) {
    return tx.$queryRaw<ResidentRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId"
      FROM "MigrationBatchRow"
      WHERE "batchId"=${batchId}::uuid
      ORDER BY "rowNumber"
    `);
  }

  private async resolveUnit(tx: Prisma.TransactionClient, societyId: string, rawRef: string) {
    const split = rawRef.trim().split(/[|/:]/).map((item) => item.trim()).filter(Boolean);
    const rows = split.length >= 2
      ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT u."id" FROM "Unit" u
          JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
          WHERE u."societyId"=${societyId}::uuid
            AND LOWER(u."number")=LOWER(${split[split.length - 1]})
            AND (LOWER(b."code")=LOWER(${split[0]}) OR LOWER(b."name")=LOWER(${split[0]}))
          LIMIT 2
        `)
      : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Unit"
          WHERE "societyId"=${societyId}::uuid AND LOWER("number")=LOWER(${rawRef.trim()})
          LIMIT 2
        `);
    if (rows.length !== 1) throw new ConflictException('Resident unit reference must resolve to exactly one current-society unit');
    return rows[0];
  }

  private value(row: Record<string, string>, ...keys: string[]) {
    return keys.map((key) => row[key]).find((item) => item?.trim())?.trim() ?? '';
  }

  private optional(row: Record<string, string>, ...keys: string[]) {
    return this.value(row, ...keys) || null;
  }

  private optionalBoolean(row: Record<string, string>, keys: string[]) {
    const value = this.value(row, ...keys);
    if (!value) return undefined;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }

  private booleanValue(row: Record<string, string>, keys: string[], fallback: boolean) {
    return this.optionalBoolean(row, keys) ?? fallback;
  }

  private integerValue(row: Record<string, string>, keys: string[], fallback: number) {
    const value = this.value(row, ...keys);
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new BadRequestException('Resident migration escalation_order must be a non-negative integer');
    return parsed;
  }

  private translateConflict(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    const candidate = error as { code?: string; meta?: { code?: string } };
    if (candidate?.code === 'P2002' || candidate?.code === '23505' || candidate?.meta?.code === '23505') {
      throw new ConflictException('Resident migration conflicts with current identity or relationship data');
    }
    throw error;
  }
}
