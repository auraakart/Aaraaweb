import { workforceAssignmentScope, workforceUnitScope } from './workforce-parent-scope';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessRequestStatus, AccessSubjectType, AuditEventType, DomesticWorkerVerificationStatus, GateMutationAction, Prisma, WorkforceAssignmentStatus } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';

/** Gate preflight, serializable mutation and fresh retry recovery select explicit clients. */
export class WorkforceGateAttendance {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly isScheduleAllowed: (schedule: Prisma.JsonValue, now: Date) => boolean,
    private readonly indiaDate: (now: Date) => string,
  ) { }
  async gateCheckIn(
    societyId: string,
    gateId: string,
    assignmentId: string,
    actorUserId: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const preflight = await this.prisma.withTenantContext(societyId, async tx => {
      await this.assertGate(tx, societyId, gateId);

      const existingReceipt = await tx.gateMutationReceipt.findUnique({
        where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } },
      });
      if (existingReceipt) {
        if (existingReceipt.gateId !== gateId || existingReceipt.action !== GateMutationAction.CHECK_IN) {
          throw new BadRequestException('Idempotency key was already used for a different gate operation');
        }
        const request = await tx.accessRequest.findFirst({ where: { id: existingReceipt.accessRequestId, societyId, unit: { is: workforceUnitScope(societyId) } } });
        if (!request || this.workforceAssignmentId(request.metadata) !== assignmentId) {
          throw new BadRequestException('Idempotency key was already used for a different workforce assignment');
        }
        return { kind: 'REPLAY' as const, result: { request, residentUserIds: await this.residentUserIds(tx, societyId, request.unitId) } };
      }

      const assignment = await tx.workforceAssignment.findFirst({
        where: { id: assignmentId, ...workforceAssignmentScope(societyId), active: true, status: WorkforceAssignmentStatus.APPROVED },
        include: {
          worker: true,
          household: {
            include: {
              unit: {
                include: {
                  occupancies: {
                    where: { societyId, active: true, gateNotificationEnabled: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
                    orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
                  },
                },
              },
            },
          },
        },
      });
      if (!assignment) throw new NotFoundException('Approved workforce assignment not found');
      if (!assignment.worker.active || assignment.worker.verification !== DomesticWorkerVerificationStatus.VERIFIED) {
        throw new BadRequestException('Domestic worker is not currently verified for gate entry');
      }
      if (assignment.startDate && now < assignment.startDate) throw new BadRequestException('Workforce assignment has not started yet');
      if (assignment.endDate && now > assignment.endDate) throw new BadRequestException('Workforce assignment has expired');
      if (!this.isScheduleAllowed(assignment.schedule, now)) throw new BadRequestException('Worker is outside the approved schedule');

      const residentUserIds = assignment.household.unit.occupancies.map((occupant) => occupant.userId);
      const hostUserId = residentUserIds[0];
      if (!hostUserId) throw new BadRequestException('Destination household does not have an active resident');

      return { kind: 'READY' as const, assignment, residentUserIds };
    });
    if (preflight.kind === 'REPLAY') return preflight.result;
    const { assignment, residentUserIds } = preflight;

    // Successful notifications must use the occupants revalidated inside
    // the write transaction, not those seen in the preflight read.
    let authorizedResidentUserIds = residentUserIds;
    try {
      const request = await this.prisma.withTenantContext(societyId, async (tx) => {
        const gates = await tx.$queryRaw<Array<{ id: string ;}>>(Prisma.sql`
          SELECT "id" FROM "Gate"
          WHERE "id"=${gateId}::uuid AND "societyId"=${societyId}::uuid AND "active"=TRUE
          LIMIT 1 FOR SHARE
        `);
        if (!gates.length) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
        const currentAssignments = await tx.$queryRaw<Array<{
          id: string; workerId: string; startDate: Date | null; endDate: Date | null; schedule: Prisma.JsonValue;
        }>>(Prisma.sql`
          SELECT wa."id",wa."workerId",wa."startDate",wa."endDate",wa."schedule"
          FROM "WorkforceAssignment" wa
          JOIN "Household" h ON h."id"=wa."householdId" AND h."societyId"=wa."societyId"
          JOIN "Unit" u ON u."id"=h."unitId" AND u."societyId"=wa."societyId"
          JOIN "Building" bd ON bd."id"=u."buildingId" AND bd."societyId"=wa."societyId"
          WHERE wa."householdId"=${assignment.householdId}::uuid AND h."unitId"=${assignment.household.unitId}::uuid
            AND wa."workerId"=${assignment.workerId}::uuid AND wa."id"=${assignmentId}::uuid AND wa."societyId"=${societyId}::uuid
            AND wa."active"=TRUE AND wa."status"='APPROVED'
          LIMIT 1 FOR UPDATE OF wa
        `);
        const currentAssignment = currentAssignments[0];
        if (!currentAssignment) throw new NotFoundException('Approved workforce assignment not found');
        if (currentAssignment.startDate && now < currentAssignment.startDate)
          throw new BadRequestException('Workforce assignment has not started yet');
        if (currentAssignment.endDate && now > currentAssignment.endDate)
          throw new BadRequestException('Workforce assignment has expired');
        if (!this.isScheduleAllowed(currentAssignment.schedule, now))
          throw new BadRequestException('Worker is outside the approved schedule');
        const verifiedWorkers = await tx.$queryRaw<Array<{ id: string ;}>>(Prisma.sql`
          SELECT "id" FROM "DomesticWorker"
          WHERE "id"=${currentAssignment.workerId}::uuid AND "societyId"=${societyId}::uuid
            AND "active"=TRUE AND "verification"='VERIFIED'
          LIMIT 1 FOR SHARE
        `);
        if (!verifiedWorkers.length)
          throw new BadRequestException('Domestic worker is not currently verified for gate entry');
        const currentOccupants = await tx.unitOccupancy.findMany({
          where: {
            societyId, unitId: assignment.household.unitId, unit: { is: workforceUnitScope(societyId) }, active: true, gateNotificationEnabled: true,
            effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          select: { userId: true },
          orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
        });
        const currentHost = currentOccupants[0]?.userId;
        if (!currentHost) throw new BadRequestException('Destination household does not have an active resident');
        authorizedResidentUserIds = currentOccupants.map(occupant => occupant.userId);
        const indiaDate = new Date(`${this.indiaDate(now)}T00:00:00.000Z`);
        const activeLeave = await tx.workforceLeave.findFirst({
          where: {
            societyId,
            assignmentId,
            active: true,
            startsOn: { lte: indiaDate },
            endsOn: { gte: indiaDate },
          },
          select: { id: true },
        });
        if (activeLeave) throw new BadRequestException('Worker is on approved leave today');

        const activeVisit = await tx.accessRequest.findFirst({
          where: {
            societyId,
            subjectType: AccessSubjectType.DOMESTIC_HELP,
            status: AccessRequestStatus.CHECKED_IN,
            metadata: { path: ['workforceAssignmentId'], equals: assignmentId },
          },
        });
        if (activeVisit) throw new BadRequestException('Worker is already checked in for this assignment');

        const created = await tx.accessRequest.create({
          data: {
            societyId,
            unitId: assignment.household.unitId,
            requestedById: currentHost,
            subjectType: AccessSubjectType.DOMESTIC_HELP,
            subjectName: assignment.worker.name,
            subjectPhone: assignment.worker.phone,
            purpose: assignment.worker.role,
            status: AccessRequestStatus.CHECKED_IN,
            validFrom: now,
            validUntil: new Date(now.getTime() + 20 * 60 * 60 * 1000),
            enteredAt: now,
            metadata: {
              source: 'WORKFORCE_ATTENDANCE',
              workforceAssignmentId: assignment.id,
              domesticWorkerId: assignment.workerId,
              gateId,
              createdByGuardId: actorUserId,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.gateMutationReceipt.create({
          data: {
            societyId,
            gateId,
            accessRequestId: created.id,
            actorUserId,
            idempotencyKey: key,
            action: GateMutationAction.CHECK_IN,
          },
        });
        await tx.auditEvent.createMany({
          data: [
            { societyId, actorUserId, gateId, accessRequestId: created.id, event: AuditEventType.ACCESS_CREATED },
            { societyId, actorUserId, gateId, accessRequestId: created.id, event: AuditEventType.ACCESS_APPROVED },
            { societyId, actorUserId, gateId, accessRequestId: created.id, event: AuditEventType.ACCESS_CHECKED_IN },
          ],
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { request, residentUserIds: authorizedResidentUserIds };
    } catch (error) {
      return this.prisma.withTenantContext(societyId, async tx => {
        const receipt = await tx.gateMutationReceipt.findUnique({
          where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } },
        });
        if (receipt && receipt.gateId === gateId && receipt.action === GateMutationAction.CHECK_IN) {
          const request = await tx.accessRequest.findFirst({ where: { id: receipt.accessRequestId, societyId, unit: { is: workforceUnitScope(societyId) } } });
          if (request && this.workforceAssignmentId(request.metadata) === assignmentId) {
            return { request, residentUserIds: await this.residentUserIds(tx, societyId, request.unitId) };
          }
        }
        const activeVisit = await tx.accessRequest.findFirst({
          where: {
            societyId,
            subjectType: AccessSubjectType.DOMESTIC_HELP,
            status: AccessRequestStatus.CHECKED_IN,
            metadata: { path: ['workforceAssignmentId'], equals: assignmentId },
          },
        });
        if (activeVisit) throw new BadRequestException('Worker is already checked in for this assignment');
        throw error;
      });
    }
  }

  async gateCheckOut(
    societyId: string,
    gateId: string,
    assignmentId: string,
    actorUserId: string,
    idempotencyKey: string,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const preflight = await this.prisma.withTenantContext(societyId, async tx => {
      const existingReceipt = await tx.gateMutationReceipt.findUnique({
        where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } },
      });
      if (existingReceipt) {
        if (existingReceipt.gateId !== gateId || existingReceipt.action !== GateMutationAction.CHECK_OUT) {
          throw new BadRequestException('Idempotency key was already used for a different gate operation');
        }
        const request = await tx.accessRequest.findFirst({ where: { id: existingReceipt.accessRequestId, societyId, unit: { is: workforceUnitScope(societyId) } } });
        if (!request || this.workforceAssignmentId(request.metadata) !== assignmentId) {
          throw new BadRequestException('Idempotency key was already used for a different workforce assignment');
        }
        return { kind: 'REPLAY' as const, result: { request, residentUserIds: await this.residentUserIds(tx, societyId, request.unitId) } };
      }

      const request = await tx.accessRequest.findFirst({
        where: {
          societyId, unit: { is: workforceUnitScope(societyId) },
          subjectType: AccessSubjectType.DOMESTIC_HELP,
          status: AccessRequestStatus.CHECKED_IN,
          metadata: { path: ['workforceAssignmentId'], equals: assignmentId },
        },
        orderBy: { enteredAt: 'desc' },
      });
      if (!request) throw new NotFoundException('Checked-in workforce visit not found');

      return { kind: 'READY' as const, request };
    });
    if (preflight.kind === 'REPLAY') return preflight.result;
    const { request } = preflight;
    const updated = await this.access.checkOutRequest(societyId, gateId, request.id, actorUserId, key);
    return this.prisma.withTenantContext(societyId, async tx => ({ request: updated, residentUserIds: await this.residentUserIds(tx, societyId, request.unitId) }));
  }

  private requireIdempotencyKey(value: string) {
    const key = value.trim();
    if (!key) throw new BadRequestException('Idempotency key is required');
    return key;
  }

  private workforceAssignmentId(metadata: Prisma.JsonValue) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const value = (metadata as Record<string, unknown>).workforceAssignmentId;
    return typeof value === 'string' ? value : undefined;
  }

  private async residentUserIds(tx: Prisma.TransactionClient, societyId: string, unitId: string) {
    const now = new Date();
    const residents = await tx.unitOccupancy.findMany({
      where: { societyId, unitId, unit: { is: workforceUnitScope(societyId) }, active: true, gateNotificationEnabled: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
      select: { userId: true },
    });
    return residents.map((resident) => resident.userId);
  }

  private async assertGate(tx: Prisma.TransactionClient, societyId: string, gateId: string) {
    const gate = await tx.gate.findFirst({ where: { id: gateId, societyId, active: true }, select: { id: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
  }

}
