import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkforceAssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type WorkforceRatingRow = {
  id: string;
  societyId: string;
  assignmentId: string;
  workerId: string;
  ratedById: string;
  score: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentOwnershipRow = {
  assignmentId: string;
  workerId: string;
  status: WorkforceAssignmentStatus;
};

type WorkforceRatingSummaryRow = {
  workerId: string;
  workerName: string;
  workerPhone: string;
  workerRole: string;
  ratingCount: bigint;
  averageScore: number | null;
};

@Injectable()
export class WorkforceRatingService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw<WorkforceRatingRow[]>(Prisma.sql`
      SELECT wr.*
      FROM "WorkforceRating" wr
      JOIN "WorkforceAssignment" wa ON wa."id" = wr."assignmentId"
      JOIN "Household" h ON h."id" = wa."householdId"
      WHERE wr."societyId" = ${societyId}::uuid
        AND wa."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = h."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ORDER BY wr."updatedAt" DESC
    `);
  }

  async rateMine(
    societyId: string,
    userId: string,
    assignmentId: string,
    input: { score: number; comment?: string },
  ) {
    if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      throw new BadRequestException('Rating score must be an integer between 1 and 5');
    }
    const comment = input.comment?.trim() || null;
    if (comment && comment.length > 300) throw new BadRequestException('Rating comment must be 300 characters or fewer');

    const ownership = await this.prisma.$queryRaw<AssignmentOwnershipRow[]>(Prisma.sql`
      SELECT wa."id" AS "assignmentId", wa."workerId", wa."status"
      FROM "WorkforceAssignment" wa
      JOIN "Household" h ON h."id" = wa."householdId"
      WHERE wa."id" = ${assignmentId}::uuid
        AND wa."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = h."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      LIMIT 1
    `);
    const assignment = ownership[0];
    if (!assignment) throw new NotFoundException('Workforce assignment not found');
    if (assignment.status !== WorkforceAssignmentStatus.APPROVED && assignment.status !== WorkforceAssignmentStatus.SUSPENDED) {
      throw new BadRequestException('Only approved or suspended workforce assignments can be rated');
    }

    const rows = await this.prisma.$queryRaw<WorkforceRatingRow[]>(Prisma.sql`
      INSERT INTO "WorkforceRating" (
        "societyId", "assignmentId", "workerId", "ratedById", "score", "comment"
      ) VALUES (
        ${societyId}::uuid,
        ${assignmentId}::uuid,
        ${assignment.workerId}::uuid,
        ${userId}::uuid,
        ${input.score},
        ${comment}
      )
      ON CONFLICT ("assignmentId") DO UPDATE SET
        "ratedById" = EXCLUDED."ratedById",
        "score" = EXCLUDED."score",
        "comment" = EXCLUDED."comment",
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "WorkforceRating"."societyId" = EXCLUDED."societyId"
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Workforce assignment not found');
    return rows[0];
  }

  async societySummary(societyId: string) {
    const rows = await this.prisma.$queryRaw<WorkforceRatingSummaryRow[]>(Prisma.sql`
      SELECT
        dw."id" AS "workerId",
        dw."name" AS "workerName",
        dw."phone" AS "workerPhone",
        dw."role"::text AS "workerRole",
        COUNT(wr."id") AS "ratingCount",
        ROUND(AVG(wr."score")::numeric, 2)::float8 AS "averageScore"
      FROM "DomesticWorker" dw
      LEFT JOIN "WorkforceRating" wr
        ON wr."workerId" = dw."id"
       AND wr."societyId" = ${societyId}::uuid
      WHERE dw."societyId" = ${societyId}::uuid
      GROUP BY dw."id", dw."name", dw."phone", dw."role"
      HAVING COUNT(wr."id") > 0
      ORDER BY "averageScore" DESC NULLS LAST, "ratingCount" DESC, dw."name" ASC
    `);

    return rows.map((row) => ({ ...row, ratingCount: Number(row.ratingCount) }));
  }
}
