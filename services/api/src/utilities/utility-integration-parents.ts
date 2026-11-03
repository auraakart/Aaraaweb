import { Prisma } from '@prisma/client';

// Correlated to the meter alias supplied by the caller, never request input.
export function utilityIntegrationMeterParents(alias: 'meter' | 'm') {
  const meter = alias === 'meter' ? Prisma.sql`meter` : Prisma.sql`m`;
  return Prisma.sql`
    (${meter}."buildingId" IS NULL OR EXISTS (
      SELECT 1 FROM "Building" parent_building
      WHERE parent_building."id"=${meter}."buildingId" AND parent_building."societyId"=${meter}."societyId"
    )) AND (${meter}."unitId" IS NULL OR EXISTS (
      SELECT 1 FROM "Unit" parent_unit JOIN "Building" parent_building
        ON parent_building."id"=parent_unit."buildingId" AND parent_building."societyId"=parent_unit."societyId"
      WHERE parent_unit."id"=${meter}."unitId" AND parent_unit."societyId"=${meter}."societyId"
        AND (${meter}."buildingId" IS NULL OR parent_unit."buildingId"=${meter}."buildingId")
    ))`;
}

export function utilityIntegrationMappingParents() {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "UtilityIntegration" parent_integration JOIN "UtilityMeter" meter
      ON meter."id"=map."meterId" AND meter."societyId"=map."societyId"
    WHERE parent_integration."id"=map."integrationId" AND parent_integration."societyId"=map."societyId"
      AND ${utilityIntegrationMeterParents('meter')}
  )`;
}
