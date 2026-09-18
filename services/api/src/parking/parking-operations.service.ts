import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type UpdatePolicyInput = { maxActiveResidentVehicles: number; requireCredential: boolean; allowTemporaryOverflow: boolean };
type IssueCredentialInput = { vehicleId: string; credential: string; note?: string };
type ReportViolationInput = { slotId?: string; vehicleId?: string; permitId?: string; code: string; severity?: 'INFO'|'WARNING'|'CRITICAL'; note?: string };

@Injectable()
export class ParkingOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  policy(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "societyId","maxActiveResidentVehicles","requireCredential","allowTemporaryOverflow","updatedByUserId","updatedAt"
      FROM "ParkingPolicy" WHERE "societyId"=${societyId}::uuid
    `);
  }

  async updatePolicy(societyId: string, actorUserId: string, input: UpdatePolicyInput) {
    if (!Number.isInteger(input.maxActiveResidentVehicles) || input.maxActiveResidentVehicles < 1 || input.maxActiveResidentVehicles > 12) {
      throw new BadRequestException('Maximum active resident vehicles must be between 1 and 12');
    }
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ParkingPolicy" ("societyId","maxActiveResidentVehicles","requireCredential","allowTemporaryOverflow","updatedByUserId")
      VALUES (${societyId}::uuid,${input.maxActiveResidentVehicles},${input.requireCredential},${input.allowTemporaryOverflow},${actorUserId}::uuid)
      ON CONFLICT ("societyId") DO UPDATE SET
        "maxActiveResidentVehicles"=EXCLUDED."maxActiveResidentVehicles",
        "requireCredential"=EXCLUDED."requireCredential",
        "allowTemporaryOverflow"=EXCLUDED."allowTemporaryOverflow",
        "updatedByUserId"=EXCLUDED."updatedByUserId",
        "updatedAt"=CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  credentials(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pc.*, hv."plateNumber", hv."vehicleType", h."unitId", u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "ParkingCredential" pc
      JOIN "HouseholdVehicle" hv ON hv."id"=pc."vehicleId" AND hv."societyId"=pc."societyId"
      JOIN "Household" h ON h."id"=hv."householdId" AND h."societyId"=pc."societyId"
      JOIN "Unit" u ON u."id"=h."unitId" AND u."societyId"=pc."societyId"
      JOIN "Building" b ON b."id"=u."buildingId"
      WHERE pc."societyId"=${societyId}::uuid ORDER BY (pc."status"='ACTIVE') DESC, pc."issuedAt" DESC LIMIT 500
    `);
  }

  async issueCredential(societyId: string, actorUserId: string, input: IssueCredentialInput) {
    const credential = input.credential.trim().toUpperCase();
    if (credential.length < 3 || credential.length > 80) throw new BadRequestException('Parking credential must be between 3 and 80 characters');
    const note = input.note?.trim() || null;
    try {
      return await this.prisma.$transaction(async tx => {
        const vehicles = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          SELECT "id" FROM "HouseholdVehicle" WHERE "id"=${input.vehicleId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1
        `);
        if (!vehicles[0]) throw new NotFoundException('Active society vehicle not found');
        const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          INSERT INTO "ParkingCredential" ("societyId","vehicleId","credential","issuedByUserId","note")
          VALUES (${societyId}::uuid,${input.vehicleId}::uuid,${credential},${actorUserId}::uuid,${note}) RETURNING *
        `);
        return rows[0];
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      if (typeof error === 'object' && error && 'code' in error && (error as {code?:string}).code === '23505') {
        throw new ConflictException('Vehicle already has an active credential or credential value is already in use');
      }
      throw error;
    }
  }

  async revokeCredential(societyId: string, actorUserId: string, credentialId: string, note?: string) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "ParkingCredential" SET "status"='REVOKED',"revokedByUserId"=${actorUserId}::uuid,"revokedAt"=CURRENT_TIMESTAMP,
        "note"=COALESCE(${note?.trim() || null},"note")
      WHERE "id"=${credentialId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE' RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Active parking credential not found');
    return rows[0];
  }

  violations(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pv.*, ps."code" AS "slotCode", hv."plateNumber"
      FROM "ParkingViolation" pv
      LEFT JOIN "ParkingSlot" ps ON ps."id"=pv."slotId" AND ps."societyId"=pv."societyId"
      LEFT JOIN "HouseholdVehicle" hv ON hv."id"=pv."vehicleId" AND hv."societyId"=pv."societyId"
      WHERE pv."societyId"=${societyId}::uuid ORDER BY (pv."status"='OPEN') DESC, pv."reportedAt" DESC LIMIT 500
    `);
  }

  async reportViolation(societyId: string, actorUserId: string, input: ReportViolationInput) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g,'_');
    if (!code || code.length > 40) throw new BadRequestException('Violation code is invalid');
    if (!input.slotId && !input.vehicleId && !input.permitId) throw new BadRequestException('Violation must reference a slot, vehicle or permit');
    const note = input.note?.trim() || null;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ParkingViolation" ("societyId","slotId","vehicleId","permitId","code","severity","note","reportedByUserId")
      SELECT ${societyId}::uuid,${input.slotId ?? null}::uuid,${input.vehicleId ?? null}::uuid,${input.permitId ?? null}::uuid,
        ${code},${input.severity ?? 'WARNING'},${note},${actorUserId}::uuid
      WHERE (${input.slotId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM "ParkingSlot" WHERE "id"=${input.slotId ?? null}::uuid AND "societyId"=${societyId}::uuid))
        AND (${input.vehicleId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM "HouseholdVehicle" WHERE "id"=${input.vehicleId ?? null}::uuid AND "societyId"=${societyId}::uuid))
        AND (${input.permitId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM "ParkingPermit" WHERE "id"=${input.permitId ?? null}::uuid AND "societyId"=${societyId}::uuid))
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Referenced parking entity not found in this society');
    return rows[0];
  }

  async resolveViolation(societyId: string, actorUserId: string, violationId: string, resolutionNote?: string) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "ParkingViolation" SET "status"='RESOLVED',"resolvedByUserId"=${actorUserId}::uuid,"resolvedAt"=CURRENT_TIMESTAMP,
        "resolutionNote"=${resolutionNote?.trim() || null}
      WHERE "id"=${violationId}::uuid AND "societyId"=${societyId}::uuid AND "status"='OPEN' RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Open parking violation not found');
    return rows[0];
  }
}
