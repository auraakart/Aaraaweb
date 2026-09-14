import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParcelRecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT DISTINCT
        uo."userId",
        resident."name",
        uo."unitId",
        u."number" AS "unitNumber",
        b."name" AS "buildingName",
        b."code" AS "buildingCode"
      FROM "UnitOccupancy" uo
      JOIN "Unit" u ON u."id"=uo."unitId" AND u."societyId"=uo."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=uo."societyId"
      JOIN "User" resident ON resident."id"=uo."userId"
      WHERE uo."societyId"=${societyId}::uuid
        AND uo."active"=true
        AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
      ORDER BY b."name" ASC, u."number" ASC, resident."name" ASC
    `);
  }
}
