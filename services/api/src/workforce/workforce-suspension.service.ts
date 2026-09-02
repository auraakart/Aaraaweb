import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomesticWorkerVerificationStatus, Prisma, WorkforceAssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkforceSuspensionService {
  constructor(private readonly prisma: PrismaService) {}

  listSuspended(societyId: string) {
    return Promise.all([
      this.prisma.domesticWorker.findMany({
        where: {
          societyId,
          active: true,
          verification: DomesticWorkerVerificationStatus.SUSPENDED,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.workforceAssignment.findMany({
        where: {
          societyId,
          active: true,
          status: WorkforceAssignmentStatus.SUSPENDED,
        },
        include: {
          worker: true,
          household: { include: { unit: { include: { building: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]).then(([workers, assignments]) => ({ workers, assignments }));
  }

  history(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        e."id", e."workerId", e."assignmentId", e."actorUserId", e."action", e."reason", e."occurredAt",
        dw."name" AS "workerName",
        wa."householdId"
      FROM "WorkforceSuspensionEvent" e
      LEFT JOIN "DomesticWorker" dw ON dw."id" = e."workerId"
      LEFT JOIN "WorkforceAssignment" wa ON wa."id" = e."assignmentId"
      WHERE e."societyId" = ${societyId}::uuid
      ORDER BY e."occurredAt" DESC
      LIMIT 200
    `);
  }

  async suspendWorker(societyId: string, workerId: string, actorUserId: string, reason: string) {
    const normalizedReason = this.requireReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.domesticWorker.findFirst({
        where: { id: workerId, societyId, active: true },
      });
      if (!worker) throw new NotFoundException('Active domestic worker not found');
      if (worker.verification === DomesticWorkerVerificationStatus.SUSPENDED) return worker;
      if (worker.verification !== DomesticWorkerVerificationStatus.VERIFIED) {
        throw new BadRequestException('Only verified domestic workers can be suspended');
      }

      const updated = await tx.domesticWorker.update({
        where: { id: worker.id },
        data: { verification: DomesticWorkerVerificationStatus.SUSPENDED },
      });
      await this.recordEvent(tx, societyId, actorUserId, 'SUSPEND', normalizedReason, worker.id, null);
      return updated;
    });
  }

  async reinstateWorker(societyId: string, workerId: string, actorUserId: string, reason?: string) {
    const normalizedReason = this.optionalReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.domesticWorker.findFirst({
        where: { id: workerId, societyId, active: true },
      });
      if (!worker) throw new NotFoundException('Active domestic worker not found');
      if (worker.verification === DomesticWorkerVerificationStatus.VERIFIED) return worker;
      if (worker.verification !== DomesticWorkerVerificationStatus.SUSPENDED) {
        throw new BadRequestException('Only suspended domestic workers can be reinstated');
      }

      const updated = await tx.domesticWorker.update({
        where: { id: worker.id },
        data: { verification: DomesticWorkerVerificationStatus.VERIFIED },
      });
      await this.recordEvent(tx, societyId, actorUserId, 'REINSTATE', normalizedReason, worker.id, null);
      return updated;
    });
  }

  async suspendAssignment(societyId: string, assignmentId: string, actorUserId: string, reason: string) {
    const normalizedReason = this.requireReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.workforceAssignment.findFirst({
        where: { id: assignmentId, societyId, active: true },
      });
      if (!assignment) throw new NotFoundException('Active workforce assignment not found');
      if (assignment.status === WorkforceAssignmentStatus.SUSPENDED) return assignment;
      if (assignment.status !== WorkforceAssignmentStatus.APPROVED) {
        throw new BadRequestException('Only approved workforce assignments can be suspended');
      }

      const updated = await tx.workforceAssignment.update({
        where: { id: assignment.id },
        data: { status: WorkforceAssignmentStatus.SUSPENDED },
      });
      await this.recordEvent(tx, societyId, actorUserId, 'SUSPEND', normalizedReason, null, assignment.id);
      return updated;
    });
  }

  async reinstateAssignment(societyId: string, assignmentId: string, actorUserId: string, reason?: string) {
    const normalizedReason = this.optionalReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.workforceAssignment.findFirst({
        where: { id: assignmentId, societyId, active: true },
        include: { worker: true },
      });
      if (!assignment) throw new NotFoundException('Active workforce assignment not found');
      if (assignment.status === WorkforceAssignmentStatus.APPROVED) return assignment;
      if (assignment.status !== WorkforceAssignmentStatus.SUSPENDED) {
        throw new BadRequestException('Only suspended workforce assignments can be reinstated');
      }
      if (assignment.worker.verification !== DomesticWorkerVerificationStatus.VERIFIED || !assignment.worker.active) {
        throw new BadRequestException('Domestic worker must be active and verified before assignment reinstatement');
      }

      const updated = await tx.workforceAssignment.update({
        where: { id: assignment.id },
        data: { status: WorkforceAssignmentStatus.APPROVED },
        include: { worker: true },
      });
      await this.recordEvent(tx, societyId, actorUserId, 'REINSTATE', normalizedReason, null, assignment.id);
      return updated;
    });
  }

  private requireReason(reason: string) {
    const normalized = reason?.trim();
    if (!normalized || normalized.length < 3) throw new BadRequestException('Suspension reason must be at least 3 characters');
    if (normalized.length > 300) throw new BadRequestException('Suspension reason must be 300 characters or fewer');
    return normalized;
  }

  private optionalReason(reason?: string) {
    const normalized = reason?.trim() || null;
    if (normalized && normalized.length > 300) throw new BadRequestException('Reason must be 300 characters or fewer');
    return normalized;
  }

  private recordEvent(
    tx: Prisma.TransactionClient,
    societyId: string,
    actorUserId: string,
    action: 'SUSPEND' | 'REINSTATE',
    reason: string | null,
    workerId: string | null,
    assignmentId: string | null,
  ) {
    return tx.$executeRaw(Prisma.sql`
      INSERT INTO "WorkforceSuspensionEvent" (
        "societyId", "workerId", "assignmentId", "actorUserId", "action", "reason"
      ) VALUES (
        ${societyId}::uuid,
        ${workerId}::uuid,
        ${assignmentId}::uuid,
        ${actorUserId}::uuid,
        ${action},
        ${reason}
      )
    `);
  }
}
