import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessRequestStatus,
  AccessSubjectType,
  AuditEventType,
  DomesticWorkerRole,
  DomesticWorkerVerificationStatus,
  GateMutationAction,
  Prisma,
  WorkforceAssignmentStatus,
} from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkforceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listMine(societyId: string, userId: string) {
    const now = new Date();
    const unitLinks = await this.prisma.unitOccupancy.findMany({
      where: { societyId, userId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      select: { unitId: true },
    });
    if (!unitLinks.length) return [];

    const households = await this.prisma.household.findMany({
      where: { societyId, unitId: { in: unitLinks.map((link) => link.unitId) } },
      select: { id: true },
    });
    if (!households.length) return [];

    return this.prisma.workforceAssignment.findMany({
      where: { societyId, householdId: { in: households.map((household) => household.id) }, active: true },
      include: {
        worker: true,
        household: { include: { unit: { include: { building: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addWorker(
    societyId: string,
    userId: string,
    input: {
      householdId: string;
      name: string;
      phone: string;
      role: DomesticWorkerRole;
      schedule?: Record<string, unknown>;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const household = await this.assertOwnHousehold(societyId, userId, input.householdId);
    const name = input.name.trim();
    const phone = this.normalizePhone(input.phone);
    if (!name) throw new BadRequestException('Worker name is required');
    if (!phone) throw new BadRequestException('Worker phone is required');
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.domesticWorker.upsert({
        where: { societyId_phone: { societyId, phone } },
        create: { societyId, name, phone, role: input.role },
        update: { active: true },
      });

      return tx.workforceAssignment.upsert({
        where: { householdId_workerId: { householdId: household.id, workerId: worker.id } },
        create: {
          societyId,
          householdId: household.id,
          workerId: worker.id,
          schedule: (input.schedule ?? {}) as Prisma.InputJsonValue,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        update: {
          active: true,
          status: WorkforceAssignmentStatus.PENDING,
          schedule: (input.schedule ?? {}) as Prisma.InputJsonValue,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
        },
        include: { worker: true },
      });
    });
  }

  async deactivateMine(societyId: string, userId: string, assignmentId: string) {
    const assignment = await this.prisma.workforceAssignment.findFirst({
      where: { id: assignmentId, societyId, active: true },
      include: { household: true },
    });
    if (!assignment) throw new NotFoundException('Active workforce assignment not found');
    await this.assertOwnHousehold(societyId, userId, assignment.householdId);

    return this.prisma.workforceAssignment.update({
      where: { id: assignment.id },
      data: { active: false },
      include: { worker: true },
    });
  }

  listPending(societyId: string) {
    return this.prisma.workforceAssignment.findMany({
      where: { societyId, status: WorkforceAssignmentStatus.PENDING, active: true },
      include: {
        worker: true,
        household: { include: { unit: { include: { building: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async review(societyId: string, assignmentId: string, decision: 'APPROVED' | 'REJECTED') {
    const assignment = await this.prisma.workforceAssignment.findFirst({
      where: { id: assignmentId, societyId, active: true },
      include: { worker: true },
    });
    if (!assignment) throw new NotFoundException('Active workforce assignment not found');
    if (assignment.status !== WorkforceAssignmentStatus.PENDING) {
      throw new BadRequestException('Only pending workforce assignments can be reviewed');
    }

    return this.prisma.$transaction(async (tx) => {
      if (decision === 'APPROVED' && assignment.worker.verification !== 'VERIFIED') {
        await tx.domesticWorker.update({ where: { id: assignment.workerId }, data: { verification: 'VERIFIED' } });
      }
      return tx.workforceAssignment.update({
        where: { id: assignment.id },
        data: { status: decision },
        include: { worker: true, household: { include: { unit: { include: { building: true } } } } },
      });
    });
  }

  async listGateEligible(societyId: string, query?: string, now = new Date()) {
    const assignments = await this.prisma.workforceAssignment.findMany({
      where: {
        societyId,
        active: true,
        status: WorkforceAssignmentStatus.APPROVED,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      include: {
        worker: true,
        household: { include: { unit: { include: { building: true } } } },
      },
      orderBy: { worker: { name: 'asc' } },
      take: 100,
    });
    const normalizedQuery = query?.trim().toLowerCase();
    return assignments.filter((assignment) => {
      if (!assignment.worker.active || assignment.worker.verification !== DomesticWorkerVerificationStatus.VERIFIED) return false;
      if (!this.isScheduleAllowed(assignment.schedule, now)) return false;
      if (!normalizedQuery) return true;
      return assignment.worker.name.toLowerCase().includes(normalizedQuery)
        || assignment.worker.phone.toLowerCase().includes(normalizedQuery);
    });
  }

  async gateCheckIn(
    societyId: string,
    gateId: string,
    assignmentId: string,
    actorUserId: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    await this.assertGate(societyId, gateId);

    const existingReceipt = await this.prisma.gateMutationReceipt.findUnique({
      where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } },
    });
    if (existingReceipt) {
      if (existingReceipt.gateId !== gateId || existingReceipt.action !== GateMutationAction.CHECK_IN) {
        throw new BadRequestException('Idempotency key was already used for a different gate operation');
      }
      const request = await this.prisma.accessRequest.findFirst({ where: { id: existingReceipt.accessRequestId, societyId } });
      if (!request || this.workforceAssignmentId(request.metadata) !== assignmentId) {
        throw new BadRequestException('Idempotency key was already used for a different workforce assignment');
      }
      return { request, residentUserIds: await this.residentUserIds(societyId, request.unitId) };
    }

    const assignment = await this.prisma.workforceAssignment.findFirst({
      where: { id: assignmentId, societyId, active: true, status: WorkforceAssignmentStatus.APPROVED },
      include: {
        worker: true,
        household: {
          include: {
            unit: {
              include: {
                occupancies: {
                  where: { active: true, gateNotificationEnabled: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
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

    try {
      const request = await this.prisma.$transaction(async (tx) => {
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
            requestedById: hostUserId,
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
      return { request, residentUserIds };
    } catch (error) {
      const receipt = await this.prisma.gateMutationReceipt.findUnique({
        where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } },
      });
      if (receipt && receipt.gateId === gateId && receipt.action === GateMutationAction.CHECK_IN) {
        const request = await this.prisma.accessRequest.findFirst({ where: { id: receipt.accessRequestId, societyId } });
        if (request && this.workforceAssignmentId(request.metadata) === assignmentId) {
          return { request, residentUserIds: await this.residentUserIds(societyId, request.unitId) };
        }
      }
      const activeVisit = await this.prisma.accessRequest.findFirst({
        where: {
          societyId,
          subjectType: AccessSubjectType.DOMESTIC_HELP,
          status: AccessRequestStatus.CHECKED_IN,
          metadata: { path: ['workforceAssignmentId'], equals: assignmentId },
        },
      });
      if (activeVisit) throw new BadRequestException('Worker is already checked in for this assignment');
      throw error;
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
    const existingReceipt = await this.prisma.gateMutationReceipt.findUnique({
      where: { societyId_idempotencyKey: { societyId, idempotencyKey: key } },
    });
    if (existingReceipt) {
      if (existingReceipt.gateId !== gateId || existingReceipt.action !== GateMutationAction.CHECK_OUT) {
        throw new BadRequestException('Idempotency key was already used for a different gate operation');
      }
      const request = await this.prisma.accessRequest.findFirst({ where: { id: existingReceipt.accessRequestId, societyId } });
      if (!request || this.workforceAssignmentId(request.metadata) !== assignmentId) {
        throw new BadRequestException('Idempotency key was already used for a different workforce assignment');
      }
      return { request, residentUserIds: await this.residentUserIds(societyId, request.unitId) };
    }

    const request = await this.prisma.accessRequest.findFirst({
      where: {
        societyId,
        subjectType: AccessSubjectType.DOMESTIC_HELP,
        status: AccessRequestStatus.CHECKED_IN,
        metadata: { path: ['workforceAssignmentId'], equals: assignmentId },
      },
      orderBy: { enteredAt: 'desc' },
    });
    if (!request) throw new NotFoundException('Checked-in workforce visit not found');

    const updated = await this.access.checkOutRequest(societyId, gateId, request.id, actorUserId, key);
    return { request: updated, residentUserIds: await this.residentUserIds(societyId, request.unitId) };
  }

  private normalizePhone(phone: string) {
    return phone.trim().replace(/[\s()-]+/g, '');
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

  private async residentUserIds(societyId: string, unitId: string) {
    const now = new Date();
    const residents = await this.prisma.unitOccupancy.findMany({
      where: { societyId, unitId, active: true, gateNotificationEnabled: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
      select: { userId: true },
    });
    return residents.map((resident) => resident.userId);
  }

  private async assertGate(societyId: string, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true }, select: { id: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
  }

  private isScheduleAllowed(schedule: Prisma.JsonValue, now: Date) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return true;
    const value = schedule as Record<string, unknown>;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
    const weekday = parts.weekday?.toUpperCase();
    const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);

    if (Array.isArray(value.days) && value.days.length > 0) {
      const days = value.days.filter((day): day is string => typeof day === 'string').map((day) => day.toUpperCase());
      if (!weekday || !days.includes(weekday)) return false;
    }

    const start = typeof value.startTime === 'string' ? this.clockMinutes(value.startTime) : undefined;
    const end = typeof value.endTime === 'string' ? this.clockMinutes(value.endTime) : undefined;
    if (start === undefined && end === undefined) return true;
    if (start === undefined || end === undefined) return false;
    if (start <= end) return currentMinutes >= start && currentMinutes <= end;
    return currentMinutes >= start || currentMinutes <= end;
  }

  private clockMinutes(value: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return undefined;
    return hour * 60 + minute;
  }

  private async assertOwnHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId } });
    if (!household) throw new NotFoundException('Household not found');
    const now = new Date();
    const link = await this.prisma.unitOccupancy.findFirst({
      where: { societyId, userId, unitId: household.unitId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Household not found');
    return household;
  }
}
