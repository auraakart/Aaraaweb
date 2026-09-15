import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ParkingSlotType = 'RESIDENT' | 'VISITOR' | 'TEMPORARY' | 'ACCESSIBLE' | 'STAFF';

type CreateSlotInput = {
  code: string;
  label?: string;
  buildingId?: string;
  slotType?: ParkingSlotType;
  evReady?: boolean;
  locationNote?: string;
};

type AllocateInput = {
  slotId: string;
  householdId: string;
  vehicleId: string;
  startsAt?: string;
  endsAt?: string;
  note?: string;
};

@Injectable()
export class ParkingService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT ps.*,
        b."name" AS "buildingName",
        pa."id" AS "allocationId",
        pa."householdId",
        pa."vehicleId",
        pa."startsAt",
        pa."endsAt",
        h."unitId",
        u."number" AS "unitNumber",
        hv."plateNumber",
        hv."vehicleType"
      FROM "ParkingSlot" ps
      LEFT JOIN "Building" b ON b."id"=ps."buildingId" AND b."societyId"=ps."societyId"
      LEFT JOIN "ParkingAllocation" pa ON pa."slotId"=ps."id" AND pa."societyId"=ps."societyId" AND pa."endedAt" IS NULL
      LEFT JOIN "Household" h ON h."id"=pa."householdId" AND h."societyId"=pa."societyId"
      LEFT JOIN "Unit" u ON u."id"=h."unitId" AND u."societyId"=pa."societyId"
      LEFT JOIN "HouseholdVehicle" hv ON hv."id"=pa."vehicleId" AND hv."societyId"=pa."societyId"
      WHERE ps."societyId"=${societyId}::uuid
      ORDER BY ps."active" DESC, ps."code" ASC
    `);
  }

  async createSlot(societyId: string, actorUserId: string, input: CreateSlotInput) {
    const code = input.code.trim().toUpperCase();
    if (code.length < 1 || code.length > 60) throw new BadRequestException('Parking slot code must be between 1 and 60 characters');
    const label = input.label?.trim() || null;
    const locationNote = input.locationNote?.trim() || null;
    if (label && label.length > 120) throw new BadRequestException('Parking slot label is too long');
    if (locationNote && locationNote.length > 300) throw new BadRequestException('Parking location note is too long');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "ParkingSlot" ("societyId","buildingId","code","label","slotType","evReady","locationNote")
          VALUES (
            ${societyId}::uuid,
            ${input.buildingId ?? null}::uuid,
            ${code},
            ${label},
            ${input.slotType ?? 'RESIDENT'},
            ${input.evReady ?? false},
            ${locationNote}
          )
          RETURNING *
        `);
        const slot = rows[0];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ParkingEvent" ("societyId","slotId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${slot.id}::uuid,${actorUserId}::uuid,'SLOT_CREATED',${code})
        `);
        return slot;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Parking slot code already exists in this society');
      throw error;
    }
  }

  async allocate(societyId: string, actorUserId: string, input: AllocateInput) {
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (!Number.isFinite(startsAt.getTime())) throw new BadRequestException('Invalid allocation start time');
    if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt)) {
      throw new BadRequestException('Allocation end time must be after the start time');
    }
    const note = input.note?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Allocation note is too long');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const slots = await tx.$queryRaw<Array<{ id: string; active: boolean }>>(Prisma.sql`
          SELECT "id","active" FROM "ParkingSlot"
          WHERE "id"=${input.slotId}::uuid AND "societyId"=${societyId}::uuid
          FOR UPDATE
        `);
        if (!slots[0]) throw new NotFoundException('Parking slot not found');
        if (!slots[0].active) throw new BadRequestException('Inactive parking slot cannot be allocated');

        const vehicles = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT hv."id"
          FROM "HouseholdVehicle" hv
          JOIN "Household" h ON h."id"=hv."householdId" AND h."societyId"=hv."societyId"
          WHERE hv."id"=${input.vehicleId}::uuid
            AND hv."householdId"=${input.householdId}::uuid
            AND hv."societyId"=${societyId}::uuid
            AND hv."active"=true
          LIMIT 1
        `);
        if (!vehicles[0]) throw new NotFoundException('Active household vehicle not found');

        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "ParkingAllocation" (
            "societyId","slotId","householdId","vehicleId","startsAt","endsAt","assignedByUserId","note"
          ) VALUES (
            ${societyId}::uuid,${input.slotId}::uuid,${input.householdId}::uuid,${input.vehicleId}::uuid,
            ${startsAt},${endsAt},${actorUserId}::uuid,${note}
          )
          RETURNING *
        `);
        const allocation = rows[0];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ParkingEvent" ("societyId","slotId","allocationId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${input.slotId}::uuid,${allocation.id}::uuid,${actorUserId}::uuid,'ALLOCATED',${note})
        `);
        return allocation;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Parking slot or vehicle already has an active allocation');
      throw error;
    }
  }

  async release(societyId: string, actorUserId: string, allocationId: string, noteInput?: string) {
    const note = noteInput?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Release note is too long');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; slotId: string }>>(Prisma.sql`
        UPDATE "ParkingAllocation"
        SET "endedAt"=CURRENT_TIMESTAMP,"endedByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${allocationId}::uuid AND "societyId"=${societyId}::uuid AND "endedAt" IS NULL
        RETURNING "id","slotId"
      `);
      const allocation = rows[0];
      if (!allocation) throw new NotFoundException('Active parking allocation not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParkingEvent" ("societyId","slotId","allocationId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${allocation.slotId}::uuid,${allocation.id}::uuid,${actorUserId}::uuid,'RELEASED',${note})
      `);
      return allocation;
    });
  }

  history(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pe.*, actor."name" AS "actorName", ps."code" AS "slotCode"
      FROM "ParkingEvent" pe
      JOIN "User" actor ON actor."id"=pe."actorUserId"
      LEFT JOIN "ParkingSlot" ps ON ps."id"=pe."slotId" AND ps."societyId"=pe."societyId"
      WHERE pe."societyId"=${societyId}::uuid
      ORDER BY pe."occurredAt" DESC
      LIMIT 500
    `);
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
