import { Prisma } from '@prisma/client';

/** Parent identifiers must belong to the same operational society, even with RLS disabled. */
export function helpdeskUnitScope(societyId: string, unitId: Prisma.Sql) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "Unit" scope_unit
    JOIN "Building" scope_building ON scope_building."id"=scope_unit."buildingId"
      AND scope_building."societyId"=scope_unit."societyId"
    WHERE scope_unit."id"=${unitId} AND scope_unit."societyId"=${societyId}::uuid
  )`;
}
