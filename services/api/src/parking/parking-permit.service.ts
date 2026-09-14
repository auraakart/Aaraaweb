import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CreatePermitInput = {
  slotId: string;
  visitorId: string;
  visitorPassId: string;
  plateNumber: string;
  startsAt: string;
  endsAt: string;
  note?: string;
};

@Injectable()
export class ParkingPermitService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pp.*,
        ps."code" AS "slotCode",
        ps."slotType",
        v."name" AS "visitorName",
        v."phone" AS "visitorPhone",
        v."unitId",
        u."number" AS "unitNumber",
        b."name" AS "buildingName"
      FROM "ParkingPermit" pp
      JOIN "ParkingSlot" ps ON ps."id"=pp."slotId" AND ps."societyId"=pp."societyId"
      JOIN "Visitor" v ON v."id"=pp."visitorId" AND v."societyId"=pp."societyId"
      JOIN "Unit" u ON u."id"=v."unitId" AND u."societyId"=pp."societyId"
      JOIN "Building" b ON b."id"=u."buildingId"
      WHERE pp."societyId"=${societyId}::uuid
      ORDER BY (pp."status"='ACTIVE') DESC, pp."startsAt" ASC, pp."createdAt" DESC
      LIMIT 500
    `);
  }

  async create(societyId: string, actorUserId: string, input: CreatePermitInput) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('Parking permit end time must be after the start time');
    }
    const plateNumber = input.plateNumber.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!plateNumber || plateNumber.length > 30) throw new BadRequestException('Vehicle registration number is invalid');
    const note = input.note?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Parking permit note is too long');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const context = await tx.$queryRaw<Array<{ slotId: string; visitorId: string }>>(Prisma.sql`
          SELECT ps."id" AS "slotId", v."id" AS "visitorId"
          FROM "ParkingSlot" ps
          JOIN "Visitor" v ON v."id"=${input.visitorId}::uuid AND v."societyId"=ps."societyId"
          JOIN "VisitorPass" vp ON vp."id"=${input.visitorPassId}::uuid
            AND vp."visitorId"=v."id"
            AND vp."societyId"=ps."societyId"
          WHERE ps."id"=${input.slotId}::uuid
            AND ps."societyId"=${societyId}::uuid
            AND ps."active"=true
            AND ps."slotType" IN ('VISITOR','TEMPORARY','ACCESSIBLE')
            AND v."status"='APPROVED'
            AND vp."status"='ACTIVE'
            AND ${startsAt} >= vp."validFrom"
            AND ${endsAt} <= vp."validUntil"
          FOR UPDATE OF ps, vp
        `);
        if (!context[0]) throw new NotFoundException('Eligible visitor pass and parking slot combination not found');

        const overlap = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "ParkingPermit"
          WHERE "slotId"=${input.slotId}::uuid
            AND "status"='ACTIVE'
            AND tstzrange("startsAt","endsAt",'[)') && tstzrange(${startsAt},${endsAt},'[)')
          LIMIT 1
        `);
        if (overlap[0]) throw new ConflictException('Parking slot already has an overlapping active permit');

        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "ParkingPermit" (
            "societyId","slotId","visitorId","visitorPassId","plateNumber","startsAt","endsAt","createdByUserId","note"
          ) VALUES (
            ${societyId}::uuid,${input.slotId}::uuid,${input.visitorId}::uuid,${input.visitorPassId}::uuid,
            ${plateNumber},${startsAt},${endsAt},${actorUserId}::uuid,${note}
          )
          RETURNING *
        `);
        const permit = rows[0];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ParkingEvent" ("societyId","slotId","permitId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${input.slotId}::uuid,${permit.id}::uuid,${actorUserId}::uuid,'PERMIT_CREATED',${plateNumber})
        `);
        return permit;
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ConflictException) throw error;
      if (this.isOverlapError(error)) throw new ConflictException('Parking slot already has an overlapping active permit');
      throw error;
    }
  }

  async cancel(societyId: string, actorUserId: string, permitId: string, noteInput?: string) {
    return this.close(societyId, actorUserId, permitId, 'CANCELLED', 'PERMIT_CANCELLED', noteInput);
  }

  async complete(societyId: string, actorUserId: string, permitId: string, noteInput?: string) {
    return this.close(societyId, actorUserId, permitId, 'COMPLETED', 'PERMIT_COMPLETED', noteInput);
  }

  private async close(
    societyId: string,
    actorUserId: string,
    permitId: string,
    status: 'CANCELLED' | 'COMPLETED',
    action: 'PERMIT_CANCELLED' | 'PERMIT_COMPLETED',
    noteInput?: string,
  ) {
    const note = noteInput?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Parking permit note is too long');

    return this.prisma.$transaction(async (tx) => {
      const rows = status === 'CANCELLED'
        ? await tx.$queryRaw<Array<{ id: string; slotId: string }>>(Prisma.sql`
            UPDATE "ParkingPermit"
            SET "status"='CANCELLED',"cancelledAt"=CURRENT_TIMESTAMP,"cancelledByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
            WHERE "id"=${permitId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE'
            RETURNING "id","slotId"
          `)
        : await tx.$queryRaw<Array<{ id: string; slotId: string }>>(Prisma.sql`
            UPDATE "ParkingPermit"
            SET "status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
            WHERE "id"=${permitId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE'
            RETURNING "id","slotId"
          `);
      const permit = rows[0];
      if (!permit) throw new NotFoundException('Active parking permit not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParkingEvent" ("societyId","slotId","permitId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${permit.slotId}::uuid,${permit.id}::uuid,${actorUserId}::uuid,${action},${note})
      `);
      return permit;
    });
  }

  private isOverlapError(error: unknown) {
    return typeof error === 'object' && error !== null && 'message' in error
      && String((error as { message?: unknown }).message).includes('overlapping active permit');
  }
}
