import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationOperationalCommitService } from './migration-operational-commit.service';
import { MigrationStructuralCommitService } from './migration-structural-commit.service';

@Injectable()
export class MigrationCommitCoordinator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly structural: MigrationStructuralCommitService,
    private readonly operational: MigrationOperationalCommitService,
  ) {}

  async commit(societyId: string, actorUserId: string, batchId: string) {
    const entityType = await this.entityType(societyId, batchId);
    if (this.structural.supports(entityType)) return this.structural.commit(societyId, actorUserId, batchId);
    if (this.operational.supports(entityType)) return this.operational.commit(societyId, actorUserId, batchId);
    throw new ConflictException('This migration entity type is not enabled for controlled commit yet');
  }

  async rollback(societyId: string, actorUserId: string, batchId: string) {
    const entityType = await this.entityType(societyId, batchId);
    if (this.structural.supports(entityType)) return this.structural.rollback(societyId, actorUserId, batchId);
    if (this.operational.supports(entityType)) return this.operational.rollback(societyId, actorUserId, batchId);
    throw new ConflictException('This migration entity type is not enabled for controlled rollback yet');
  }

  private async entityType(societyId: string, batchId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ entityType: string }>>(Prisma.sql`
      SELECT "entityType" FROM "MigrationBatch" WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Migration batch not found');
    return rows[0].entityType;
  }
}
