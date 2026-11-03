import { Prisma } from '@prisma/client';

// Correlated to the charge draft alias d. Inactive meters/tariffs remain valid
// historical parents; status/financial transitions are checked by callers.
export function utilityChargeParents() {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "UtilityMeter" scope_meter
    JOIN "Unit" scope_unit ON scope_unit."id"=d."unitId" AND scope_unit."societyId"=d."societyId"
    JOIN "Building" scope_building ON scope_building."id"=scope_unit."buildingId" AND scope_building."societyId"=d."societyId"
    JOIN "UtilityTariffPlan" scope_plan ON scope_plan."id"=d."tariffPlanId" AND scope_plan."societyId"=d."societyId"
      AND scope_plan."meterType"=scope_meter."meterType"
    JOIN "UtilityReading" scope_opening ON scope_opening."id"=d."openingReadingId" AND scope_opening."societyId"=d."societyId"
      AND scope_opening."meterId"=scope_meter."id"
    JOIN "UtilityReading" scope_closing ON scope_closing."id"=d."closingReadingId" AND scope_closing."societyId"=d."societyId"
      AND scope_closing."meterId"=scope_meter."id"
    WHERE scope_meter."id"=d."meterId" AND scope_meter."societyId"=d."societyId" AND scope_meter."unitId"=d."unitId"
      AND (scope_meter."buildingId" IS NULL OR scope_meter."buildingId"=scope_building."id")
  )`;
}
