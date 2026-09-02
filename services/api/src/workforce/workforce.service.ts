import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomesticWorkerRole, Prisma, WorkforceAssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkforceService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(societyId: string, userId: string) {
    const unitLinks = await this.prisma.unitResident.findMany({
      where: { societyId, userId, active: true },
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

  private normalizePhone(phone: string) {
    return phone.trim().replace(/[\s()-]+/g, '');
  }

  private async assertOwnHousehold(societyId: string, userId: string, householdId: string) {
    const household = await this.prisma.household.findFirst({ where: { id: householdId, societyId } });
    if (!household) throw new NotFoundException('Household not found');
    const link = await this.prisma.unitResident.findFirst({
      where: { societyId, userId, unitId: household.unitId, active: true },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Household not found');
    return household;
  }
}
