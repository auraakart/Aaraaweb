import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SocietyWorkerVerificationStatus } from '@prisma/client';
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

@Injectable()
export class SocietyWorkforceService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.societyWorker.findMany({
      where: { societyId },
      include: {
        gateAccesses: { where: { active: true }, include: { gate: true }, orderBy: { createdAt: 'asc' } },
        attendances: { where: { checkedOutAt: null }, include: { gate: true }, take: 1 },
      },
      orderBy: [{ active: 'desc' }, { department: 'asc' }, { name: 'asc' }],
      take: 500,
    });
  }

  attendance(societyId: string) {
    return this.prisma.societyWorkerAttendance.findMany({
      where: { societyId },
      include: { worker: true, gate: true },
      orderBy: { checkedInAt: 'desc' },
      take: 300,
    });
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
      return tx.societyWorker.findUniqueOrThrow({
        where: { id: worker.id },
        include: { gateAccesses: { include: { gate: true } } },
      });
    });
  }

  async configure(societyId: string, workerId: string, input: WorkerConfig) {
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
    return this.prisma.societyWorker.update({
      where: { id: worker.id },
      data: {
        verification: SocietyWorkerVerificationStatus.VERIFIED,
        active: true,
        verifiedByUserId: actorUserId,
        verifiedAt: new Date(),
      },
    });
  }

  async reject(societyId: string, workerId: string, actorUserId: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.PENDING) {
      throw new BadRequestException('Only pending society workers can be rejected');
    }
    return this.prisma.societyWorker.update({
      where: { id: worker.id },
      data: {
        verification: SocietyWorkerVerificationStatus.REJECTED,
        active: false,
        verifiedByUserId: actorUserId,
        verifiedAt: new Date(),
      },
    });
  }

  async suspend(societyId: string, workerId: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.VERIFIED || !worker.active) {
      throw new BadRequestException('Only active verified society workers can be suspended');
    }
    const open = await this.prisma.societyWorkerAttendance.findFirst({
      where: { societyId, workerId: worker.id, checkedOutAt: null },
    });
    if (open) throw new BadRequestException('Worker must be checked out before suspension');
    return this.prisma.societyWorker.update({
      where: { id: worker.id },
      data: { verification: SocietyWorkerVerificationStatus.SUSPENDED, active: false },
    });
  }

  async reactivate(societyId: string, workerId: string) {
    const worker = await this.requireWorker(societyId, workerId);
    if (worker.verification !== SocietyWorkerVerificationStatus.SUSPENDED) {
      throw new BadRequestException('Only suspended society workers can be reactivated');
    }
    return this.prisma.societyWorker.update({
      where: { id: worker.id },
      data: { verification: SocietyWorkerVerificationStatus.VERIFIED, active: true },
    });
  }

  async gateEligible(societyId: string, gateId: string, query?: string, now = new Date()) {
    await this.assertGates(societyId, [gateId]);
    const workers = await this.prisma.societyWorker.findMany({
      where: {
        societyId,
        active: true,
        verification: SocietyWorkerVerificationStatus.VERIFIED,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
        gateAccesses: { some: { societyId, gateId, active: true } },
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
}
