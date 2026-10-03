import { Prisma } from '@prisma/client';

/**
 * Reusable, parameterized property-scope predicates for high-risk resident
 * workflows. These helpers keep ownership/occupancy semantics identical across
 * modules and always bind society, user and unit together.
 */
export function currentResidentPropertySql(societyId: string, userId: string, unitId: string) {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM "UnitOccupancy" o
      WHERE o."societyId"=${societyId}::uuid AND o."unitId"=${unitId}::uuid
        AND o."userId"=${userId}::uuid AND o."active"=TRUE
        AND o."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (o."effectiveTo" IS NULL OR o."effectiveTo">CURRENT_TIMESTAMP)
    )
    OR EXISTS (
      SELECT 1 FROM "UnitOwnership" ow
      WHERE ow."societyId"=${societyId}::uuid AND ow."unitId"=${unitId}::uuid
        AND ow."userId"=${userId}::uuid AND ow."active"=TRUE AND ow."verified"=TRUE
        AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
    )
  )`;
}

export function currentPayerPropertySql(societyId: string, userId: string, unitId: string) {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM "UnitOwnership" uo
      WHERE uo."societyId"=${societyId}::uuid AND uo."unitId"=${unitId}::uuid
        AND uo."userId"=${userId}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE
        AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
    )
    OR EXISTS (
      SELECT 1 FROM "UnitOccupancy" occ
      WHERE occ."societyId"=${societyId}::uuid AND occ."unitId"=${unitId}::uuid
        AND occ."userId"=${userId}::uuid AND occ."relation"='TENANT' AND occ."active"=TRUE
        AND occ."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (occ."effectiveTo" IS NULL OR occ."effectiveTo">CURRENT_TIMESTAMP)
    )
  )`;
}
