import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomesticWorkerVerificationStatus, WorkforceAssignmentStatus } from '@prisma/client';
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

  async suspendWorker(societyId: string, workerId: string) {
    const worker = await this.prisma.domesticWorker.findFirst({
      where: { id: workerId, societyId, active: true },
    });
    if (!worker) throw new NotFoundException('Active domestic worker not found');
    if (worker.verification === DomesticWorkerVerificationStatus.SUSPENDED) return worker;
    if (worker.verification !== DomesticWorkerVerificationStatus.VERIFIED) {
      throw new BadRequestException('Only verified domestic workers can be suspended');
    }

    return this.prisma.domesticWorker.update({
      where: { id: worker.id },
      data: { verification: DomesticWorkerVerificationStatus.SUSPENDED },
    });
  }

  async reinstateWorker(societyId: string, workerId: string) {
    const worker = await this.prisma.domesticWorker.findFirst({
      where: { id: workerId, societyId, active: true },
    });
    if (!worker) throw new NotFoundException('Active domestic worker not found');
    if (worker.verification === DomesticWorkerVerificationStatus.VERIFIED) return worker;
    if (worker.verification !== DomesticWorkerVerificationStatus.SUSPENDED) {
      throw new BadRequestException('Only suspended domestic workers can be reinstated');
    }

    return this.prisma.domesticWorker.update({
      where: { id: worker.id },
      data: { verification: DomesticWorkerVerificationStatus.VERIFIED },
    });
  }

  async suspendAssignment(societyId: string, assignmentId: string) {
    const assignment = await this.prisma.workforceAssignment.findFirst({
      where: { id: assignmentId, societyId, active: true },
    });
    if (!assignment) throw new NotFoundException('Active workforce assignment not found');
    if (assignment.status === WorkforceAssignmentStatus.SUSPENDED) return assignment;
    if (assignment.status !== WorkforceAssignmentStatus.APPROVED) {
      throw new BadRequestException('Only approved workforce assignments can be suspended');
    }

    return this.prisma.workforceAssignment.update({
      where: { id: assignment.id },
      data: { status: WorkforceAssignmentStatus.SUSPENDED },
    });
  }

  async reinstateAssignment(societyId: string, assignmentId: string) {
    const assignment = await this.prisma.workforceAssignment.findFirst({
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

    return this.prisma.workforceAssignment.update({
      where: { id: assignment.id },
      data: { status: WorkforceAssignmentStatus.APPROVED },
      include: { worker: true },
    });
  }
}
