import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SocietyWorkerEventType, SocietyWorkerVerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type WorkerInput = {
  name: string;
  phone: string;
  role: string;
  department: string;
  employer?: string;
  gateIds: string[];
  schedule?: Record<string, unknown>;
  startDate?: Date;
  endDate?: Date;
};

type WorkerConfig = {
  role?: string;
  department?: string;
  employer?: string | null;
  gateIds?: string[];
  schedule?: Record<string, unknown>;
  startDate?: Date | null;
  endDate?: Date | null;
};

type AttendanceFilters = {
  workerId?: string;
  gateId?: string;
  from?: Date;
  to?: Date;
  insideOnly?: boolean;
};

type AttendanceCorrection = {
  checkedInAt?: Date;
  checkedOutAt?: Date | null;
  reason: string;
};

@Injectable()
export class SocietyWorkforceService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    const today = this.localCalendarDate(new Date());
    return this.prisma.societyWorker.findMany({
      where: { societyId },
      include: {
        gateAccesses: { where: { active: true }, include: { gate: true }, orderBy: { createdAt: 'asc' } },
        attendances: { where: { checkedOutAt: null }, include: { gate: true }, take: 1 },
        leaves: {
          where: { active: true, startsOn: { lte: today }, endsOn: { gte: today } },
          orderBy: { startsOn: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ active: 'desc' }, { department: 'asc' }, { name: 'asc' }],
      take: 500,
    });
  }

  attendance(societyId: string, filters: AttendanceFilters = {}) {
    return this.prisma.societyWorkerAttendance.findMany({
      where: {
        societyId,
        ...(filters.workerId ? { workerId: filters.workerId } : {}),
        ...(filters.gateId ? { gateId: filters.gateId } : {}),
        ...(filters.insideOnly ? { checkedOutAt: null } : {}),
        ...((filters.from || filters.to)
          ? {
              checkedInAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: { worker: true, gate: true },
      orderBy: { checkedInAt: 'desc' },
      take: 1000,
    });
  }

  leaves(societyId: string, workerId?: string) {
    return this.prisma.societyWorkerLeave.findMany({
      where: { societyId, ...(workerId ? { workerId } : {}) },
      include: { worker: true },
      orderBy: [{ active: 'desc' }, { startsOn: 'desc' }],
      take: 500,
    });
  }

  async timeline(societyId: string, workerId: string) {
    await this.requireWorker(societyId, workerId);
    return this.prisma.societyWorkerEvent.findMany({
      where: { societyId, workerId },
      orderBy: { occurredAt: 'desc' },
      take: 300,
    });
  }

  async operationsSummary(societyId: string, now = new Date()) {
    const today = this.localCalendarDate(now);
    const longOpenBefore = new Date(now.getTime() - 16 * 60 * 60 * 1000);
    const workers = await this.prisma.societyWorker.findMany({
      where: { societyId },
      include: {
        gateAccesses: { where: { active: true }, select: { id: true } },
        attendances: { where: { checkedOutAt: null }, orderBy: { checkedInAt: 'desc' }, take: 1 },
        leaves: { where: { active: true, startsOn: { lte: today }, endsOn: { gte: today } }, take: 1 },
      },
      orderBy: { name: 'asc' },
      take: 1000,
    });

    const active = workers.filter((worker) => worker.active);
    const inside = active.filter((worker) => worker.attendances.length > 0);
    const onLeave = active.filter((worker) => worker.leaves.length > 0);
    const expectedNow = active.filter((worker) =>
      worker.verification === SocietyWorkerVerificationStatus.VERIFIED
      && worker.gateAccesses.length > 0
      && this.isEffective(worker.startDate, worker.endDate, now)
      && worker.leaves.length === 0
      && this.isScheduleAllowed(worker.schedule, now),
    );
    const expectedNowNotInside = expectedNow
      .filter((worker) => worker.attendances.length === 0)
      .map((worker) => ({ id: worker.id, name: worker.name, role: worker.role, department: worker.department }));
    const longOpenAttendance = inside
      .filter((worker) => !!worker.attendances[0] && worker.attendances[0].checkedInAt < longOpenBefore)
      .map((worker) => ({
        workerId: worker.id,
        name: worker.name,
        checkedInAt: worker.attendances[0]!.checkedInAt,
      }));

    return {
      active: active.length,
      pendingVerification: workers.filter((worker) => worker.verification === SocietyWorkerVerificationStatus.PENDING).length,
      suspended: workers.filter((worker) => worker.verification === SocietyWorkerVerificationStatus.SUSPENDED).length,
      inside: inside.length,
      onLeave: onLeave.length,
      expectedNow: expectedNow.length,
      expectedNowNotInside,
      longOpenAttendance,
    };
  }

  async create(societyId: string, actorUserId: string, input: WorkerInput) {
    const name = input.name.trim();
    const phone = this.normalizePhone(input.phone);
    const role = input.role.trim();
    const department = input.department.trim();
    const employer = input.employer?.trim() || null;
    if (!name || !phone || !role || !department) throw new BadRequestException('Name, phone, role and department are required');
    this.assertDateWindow(input.startDate, input.endDate);
    const gateIds = this.uniqueGateIds(input.gateIds);
    await this.assertGates(societyId, gateIds);

    const existing = await this.prisma.societyWorker.findFirst({ where: { societyId, phone } });
    if (existing) throw new BadRequestException('A society worker with this phone already exists');

    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.societyWorker.create({
        data: {
          societyId,
          name,
          phone,
          role,
          department,
          employer,
          schedule: (input.schedule ?? {}) as Prisma.InputJsonValue,
          startDate: input.startDate,
          endDate: input.endDate,
          createdByUserId: actorUserId,
        },
      });
      if (gateIds.length) {
        await tx.societyWorkerGateAccess.createMany({
          data: gateIds.map((gateId) => ({ societyId, workerId: worker.id, gateId })),
        });
      }
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.CREATED, undefined, {
        role,
        department,
        gateIds,
      });
      return tx.societyWorker.findUniqueOrThrow({
        where: { id: worker.id },
        include: { gateAccesses: { include: { gate: true } } },
      });
    });
  }

  async configure(societyId: string, workerId: string, actorUserId: string, input: WorkerConfig) {
    const worker = await this.requireWorker(societyId, workerId);
    const startDate = input.startDate === undefined ? worker.startDate : input.startDate;
    const endDate = input.endDate === undefined ? worker.endDate : input.endDate;
    this.assertDateWindow(startDate ?? undefined, endDate ?? undefined);
    const gateIds = input.gateIds === undefined ? undefined : this.uniqueGateIds(input.gateIds);
    if (gateIds) await this.assertGates(societyId, gateIds);

    return this.prisma.$transaction(async (tx) => {
      await tx.societyWorker.update({
        where: { id: worker.id },
        data: {
          ...(input.role !== undefined ? { role: this.requiredText(input.role, 'Role') } : {}),
          ...(input.department !== undefined ? { department: this.requiredText(input.department, 'Department') } : {}),
          ...(input.employer !== undefined ? { employer: input.employer?.trim() || null } : {}),
          ...(input.schedule !== undefined ? { schedule: input.schedule as Prisma.InputJsonValue } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        },
      });
      if (gateIds) {
        await tx.societyWorkerGateAccess.deleteMany({ where: { societyId, workerId: worker.id } });
        if (gateIds.length) {
          await tx.societyWorkerGateAccess.createMany({
            data: gateIds.map((gateId) => ({ societyId, workerId: worker.id, gateId })),
          });
        }
      }
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.CONFIGURED, undefined, {
        changed: Object.keys(input).filter((key) => (input as Record<string, unknown>)[key] !== undefined),
        ...(gateIds ? { gateIds } : {}),
      });
      return tx.societyWorker.findUniqueOrThrow({
        where: { id: worker.id },
        include: { gateAccesses: { include: { gate: true } } },
      });
    });
  }

  async verify(societyId: string, workerId: string, actorUserId: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.PENDING) {
      throw new BadRequestException('Only pending society workers can be verified');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.societyWorker.update({
        where: { id: worker.id },
        data: {
          verification: SocietyWorkerVerificationStatus.VERIFIED,
          active: true,
          verifiedByUserId: actorUserId,
          verifiedAt: new Date(),
        },
      });
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.VERIFIED);
      return updated;
    });
  }

  async reject(societyId: string, workerId: string, actorUserId: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.PENDING) {
      throw new BadRequestException('Only pending society workers can be rejected');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.societyWorker.update({
        where: { id: worker.id },
        data: {
          verification: SocietyWorkerVerificationStatus.REJECTED,
          active: false,
          verifiedByUserId: actorUserId,
          verifiedAt: new Date(),
        },
      });
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.REJECTED);
      return updated;
    });
  }

  async suspend(societyId: string, workerId: string, actorUserId: string, reason?: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.VERIFIED || !worker.active) {
      throw new BadRequestException('Only active verified society workers can be suspended');
    }
    const open = await this.prisma.societyWorkerAttendance.findFirst({
      where: { societyId, workerId: worker.id, checkedOutAt: null },
    });
    if (open) throw new BadRequestException('Worker must be checked out before suspension');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.societyWorker.update({
        where: { id: worker.id },
        data: { verification: SocietyWorkerVerificationStatus.SUSPENDED, active: false },
      });
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.SUSPENDED, reason);
      return updated;
    });
  }

  async reactivate(societyId: string, workerId: string, actorUserId: string, reason?: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.SUSPENDED) {
      throw new BadRequestException('Only suspended society workers can be reactivated');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.societyWorker.update({
        where: { id: worker.id },
        data: { verification: SocietyWorkerVerificationStatus.VERIFIED, active: true },
      });
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.REACTIVATED, reason);
      return updated;
    });
  }

  async addLeave(societyId: string, workerId: string, actorUserId: string, startsOn: Date, endsOn: Date, reason?: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (endsOn < startsOn) throw new BadRequestException('Leave end date must be on or after start date');
    const overlap = await this.prisma.societyWorkerLeave.findFirst({
      where: { societyId, workerId, active: true, startsOn: { lte: endsOn }, endsOn: { gte: startsOn } },
    });
    if (overlap) throw new BadRequestException('An active leave already overlaps this period');

    return this.prisma.$transaction(async (tx) => {
      const leave = await tx.societyWorkerLeave.create({
        data: {
          societyId,
          workerId,
          startsOn,
          endsOn,
          reason: reason?.trim() || null,
          createdByUserId: actorUserId,
        },
      });
      await this.recordEvent(tx, societyId, worker.id, actorUserId, SocietyWorkerEventType.LEAVE_ADDED, reason, {
        leaveId: leave.id,
        startsOn: startsOn.toISOString().slice(0, 10),
        endsOn: endsOn.toISOString().slice(0, 10),
      });
      return leave;
    });
  }

  async cancelLeave(societyId: string, leaveId: string, actorUserId: string, reason?: string) {
    const leave = await this.prisma.societyWorkerLeave.findFirst({ where: { id: leaveId, societyId } });
    if (!leave) throw new NotFoundException('Society workforce leave not found');
    if (!leave.active) throw new BadRequestException('Leave is already cancelled');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.societyWorkerLeave.update({
        where: { id: leave.id },
        data: { active: false, cancelledByUserId: actorUserId, cancelledAt: new Date() },
      });
      await this.recordEvent(tx, societyId, leave.workerId, actorUserId, SocietyWorkerEventType.LEAVE_CANCELLED, reason, {
        leaveId: leave.id,
      });
      return updated;
    });
  }

  async correctAttendance(societyId: string, attendanceId: string, actorUserId: string, correction: AttendanceCorrection) {
    const reason = correction.reason.trim();
    if (reason.length < 5) throw new BadRequestException('Attendance correction reason must be at least 5 characters');
    const attendance = await this.prisma.societyWorkerAttendance.findFirst({ where: { id: attendanceId, societyId } });
    if (!attendance) throw new NotFoundException('Society workforce attendance not found');
    const checkedInAt = correction.checkedInAt ?? attendance.checkedInAt;
    const checkedOutAt = correction.checkedOutAt === undefined ? attendance.checkedOutAt : correction.checkedOutAt;
    if (checkedOutAt && checkedOutAt < checkedInAt) throw new BadRequestException('Check-out cannot be before check-in');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.societyWorkerAttendance.update({
        where: { id: attendance.id },
        data: { checkedInAt, checkedOutAt },
        include: { worker: true, gate: true },
      });
      await this.recordEvent(tx, societyId, attendance.workerId, actorUserId, SocietyWorkerEventType.ATTENDANCE_CORRECTED, reason, {
        attendanceId: attendance.id,
        previousCheckedInAt: attendance.checkedInAt.toISOString(),
        previousCheckedOutAt: attendance.checkedOutAt?.toISOString() ?? null,
        checkedInAt: checkedInAt.toISOString(),
        checkedOutAt: checkedOutAt?.toISOString() ?? null,
      });
      return updated;
    });
  }

  async gateEligible(societyId: string, gateId: string, query?: string, now = new Date()) {
    await this.assertGates(societyId, [gateId]);
    const today = this.localCalendarDate(now);
    const workers = await this.prisma.societyWorker.findMany({
      where: {
        societyId,
        active: true,
        verification: SocietyWorkerVerificationStatus.VERIFIED,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
        gateAccesses: { some: { societyId, gateId, active: true } },
        leaves: { none: { active: true, startsOn: { lte: today }, endsOn: { gte: today } } },
      },
      include: {
        gateAccesses: { where: { gateId, active: true }, include: { gate: true } },
        attendances: { where: { checkedOutAt: null }, orderBy: { checkedInAt: 'desc' }, take: 1 },
      },
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    const normalized = query?.trim().toLowerCase();
    return workers
      .filter((worker) => this.isScheduleAllowed(worker.schedule, now))
      .filter((worker) => !normalized
        || worker.name.toLowerCase().includes(normalized)
        || worker.phone.toLowerCase().includes(normalized)
        || worker.role.toLowerCase().includes(normalized)
        || worker.department.toLowerCase().includes(normalized))
      .map((worker) => ({ ...worker, present: worker.attendances.length > 0 }));
  }

  async gateLookup(societyId: string, gateId: string, query: string, now = new Date()) {
    await this.assertGates(societyId, [gateId]);
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) throw new BadRequestException('Enter at least 2 characters to look up a worker');
    const today = this.localCalendarDate(now);
    const workers = await this.prisma.societyWorker.findMany({
      where: {
        societyId,
        OR: [
          { name: { contains: query.trim(), mode: 'insensitive' } },
          { phone: { contains: query.trim(), mode: 'insensitive' } },
          { role: { contains: query.trim(), mode: 'insensitive' } },
          { department: { contains: query.trim(), mode: 'insensitive' } },
        ],
      },
      include: {
        gateAccesses: { where: { active: true }, include: { gate: true } },
        attendances: { where: { checkedOutAt: null }, orderBy: { checkedInAt: 'desc' }, take: 1 },
        leaves: { where: { active: true, startsOn: { lte: today }, endsOn: { gte: today } }, take: 1 },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    return workers.map((worker) => {
      let reason: string | null = null;
      if (!worker.active) reason = 'Worker is inactive';
      else if (worker.verification !== SocietyWorkerVerificationStatus.VERIFIED) reason = `Verification status is ${worker.verification.toLowerCase()}`;
      else if (!this.isEffective(worker.startDate, worker.endDate, now)) reason = 'Worker is outside the effective assignment dates';
      else if (!worker.gateAccesses.some((access) => access.gateId === gateId)) reason = 'Worker is not assigned to this gate';
      else if (worker.leaves.length > 0) reason = 'Worker is on approved leave';
      else if (!this.isScheduleAllowed(worker.schedule, now)) reason = 'Worker is outside the assigned shift';
      return {
        id: worker.id,
        name: worker.name,
        phone: worker.phone,
        role: worker.role,
        department: worker.department,
        present: worker.attendances.length > 0,
        eligible: reason === null,
        reason,
      };
    });
  }

  async checkIn(societyId: string, gateId: string, workerId: string, actorUserId: string, idempotencyKey: string, now = new Date()) {
    const key = this.requireKey(idempotencyKey);
    const existing = await this.prisma.societyWorkerAttendance.findFirst({ where: { societyId, checkInKey: key } });
    if (existing) {
      if (existing.workerId !== workerId || existing.gateId !== gateId) throw new BadRequestException('Idempotency key was already used for another attendance action');
      return existing;
    }

    const eligible = await this.gateEligible(societyId, gateId, undefined, now);
    if (!eligible.some((worker) => worker.id === workerId)) throw new BadRequestException('Society worker is not eligible at this gate now');
    const open = await this.prisma.societyWorkerAttendance.findFirst({ where: { societyId, workerId, checkedOutAt: null } });
    if (open) throw new BadRequestException('Society worker is already checked in');

    return this.prisma.societyWorkerAttendance.create({
      data: {
        societyId,
        workerId,
        gateId,
        checkedInAt: now,
        checkInByUserId: actorUserId,
        checkInKey: key,
      },
      include: { worker: true, gate: true },
    });
  }

  async checkOut(societyId: string, gateId: string, workerId: string, actorUserId: string, idempotencyKey: string, now = new Date()) {
    const key = this.requireKey(idempotencyKey);
    const replay = await this.prisma.societyWorkerAttendance.findFirst({ where: { societyId, checkOutKey: key } });
    if (replay) {
      if (replay.workerId !== workerId || replay.gateId !== gateId) throw new BadRequestException('Idempotency key was already used for another attendance action');
      return replay;
    }
    await this.assertGates(societyId, [gateId]);
    const worker = await this.requireWorker(societyId, workerId);
    if (!worker.active || worker.verification !== SocietyWorkerVerificationStatus.VERIFIED) {
      throw new BadRequestException('Society worker is not currently active and verified');
    }
    const open = await this.prisma.societyWorkerAttendance.findFirst({
      where: { societyId, workerId, checkedOutAt: null },
      orderBy: { checkedInAt: 'desc' },
    });
    if (!open) throw new BadRequestException('Society worker is not currently checked in');
    if (open.gateId !== gateId) throw new BadRequestException('Worker must check out through the same gate for this attendance record');

    return this.prisma.societyWorkerAttendance.update({
      where: { id: open.id },
      data: { checkedOutAt: now, checkOutByUserId: actorUserId, checkOutKey: key },
      include: { worker: true, gate: true },
    });
  }

  private async requireWorker(societyId: string, workerId: string) {
    const worker = await this.prisma.societyWorker.findFirst({ where: { id: workerId, societyId } });
    if (!worker) throw new NotFoundException('Society worker not found');
    return worker;
  }

  private async assertGates(societyId: string, gateIds: string[]) {
    if (!gateIds.length) return;
    const count = await this.prisma.gate.count({ where: { societyId, id: { in: gateIds }, active: true } });
    if (count !== gateIds.length) throw new BadRequestException('One or more selected gates are invalid or inactive');
  }

  private uniqueGateIds(gateIds: string[]) {
    return [...new Set(gateIds)];
  }

  private normalizePhone(phone: string) {
    const value = phone.trim().replace(/[\s()-]/g, '');
    return /^\+?[0-9]{8,15}$/.test(value) ? value : '';
  }

  private requiredText(value: string, label: string) {
    const text = value.trim();
    if (!text) throw new BadRequestException(`${label} is required`);
    return text;
  }

  private assertDateWindow(startDate?: Date, endDate?: Date) {
    if (startDate && endDate && endDate < startDate) throw new BadRequestException('End date must be after start date');
  }

  private requireKey(value: string) {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 160) throw new BadRequestException('A valid Idempotency-Key is required');
    return key;
  }

  private isEffective(startDate: Date | null, endDate: Date | null, now: Date) {
    return (!startDate || startDate <= now) && (!endDate || endDate >= now);
  }

  private localCalendarDate(now: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  private isScheduleAllowed(schedule: Prisma.JsonValue, now: Date) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return true;
    const value = schedule as Record<string, unknown>;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value?.toUpperCase();
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const currentMinutes = hour * 60 + minute;
    const days = Array.isArray(value.days) ? value.days.map((day) => String(day).toUpperCase()) : [];
    if (days.length && weekday && !days.includes(weekday)) return false;
    const parse = (raw: unknown) => {
      if (typeof raw !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
      const [h, m] = raw.split(':').map(Number);
      return h * 60 + m;
    };
    const start = parse(value.start);
    const end = parse(value.end);
    if (start === null || end === null) return true;
    return start <= end ? currentMinutes >= start && currentMinutes <= end : currentMinutes >= start || currentMinutes <= end;
  }

  private recordEvent(
    tx: Prisma.TransactionClient,
    societyId: string,
    workerId: string,
    actorUserId: string,
    event: SocietyWorkerEventType,
    reason?: string,
    details: Record<string, unknown> = {},
  ) {
    return tx.societyWorkerEvent.create({
      data: {
        societyId,
        workerId,
        actorUserId,
        event,
        reason: reason?.trim() || null,
        details: details as Prisma.InputJsonValue,
      },
    });
  }
}
