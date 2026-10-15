CREATE TABLE "UtilityMeter" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "buildingId" UUID REFERENCES "Building"("id") ON DELETE SET NULL,
  "unitId" UUID REFERENCES "Unit"("id") ON DELETE SET NULL,
  "code" TEXT NOT NULL,
  "label" TEXT,
  "meterType" TEXT NOT NULL,
  "externalRef" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityMeter_meterType_check" CHECK ("meterType" IN ('ELECTRICITY','WATER','DG','GAS','OTHER')),
  CONSTRAINT "UtilityMeter_code_nonblank" CHECK (length(btrim("code")) > 0)
);

CREATE UNIQUE INDEX "UtilityMeter_society_code_key" ON "UtilityMeter"("societyId", "code");
CREATE INDEX "UtilityMeter_society_active_idx" ON "UtilityMeter"("societyId", "active", "meterType");
CREATE INDEX "UtilityMeter_unit_idx" ON "UtilityMeter"("societyId", "unitId") WHERE "unitId" IS NOT NULL;

CREATE TABLE "UtilityReading" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "meterId" UUID NOT NULL REFERENCES "UtilityMeter"("id") ON DELETE CASCADE,
  "readingAt" TIMESTAMPTZ NOT NULL,
  "value" NUMERIC(18,6) NOT NULL,
  "readingKind" TEXT NOT NULL DEFAULT 'ACTUAL',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "note" TEXT,
  "recordedByUserId" UUID NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityReading_value_nonnegative" CHECK ("value" >= 0),
  CONSTRAINT "UtilityReading_kind_check" CHECK ("readingKind" IN ('ACTUAL','RESET')),
  CONSTRAINT "UtilityReading_source_check" CHECK ("source" IN ('MANUAL','IMPORT','INTEGRATION'))
);

CREATE UNIQUE INDEX "UtilityReading_meter_time_key" ON "UtilityReading"("meterId", "readingAt");
CREATE INDEX "UtilityReading_society_time_idx" ON "UtilityReading"("societyId", "readingAt" DESC);

CREATE TABLE "UtilityEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "meterId" UUID REFERENCES "UtilityMeter"("id") ON DELETE SET NULL,
  "readingId" UUID REFERENCES "UtilityReading"("id") ON DELETE SET NULL,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityEvent_action_check" CHECK ("action" IN ('METER_CREATED','METER_DEACTIVATED','READING_RECORDED'))
);

CREATE INDEX "UtilityEvent_society_time_idx" ON "UtilityEvent"("societyId", "occurredAt" DESC);

CREATE OR REPLACE FUNCTION "validate_utility_meter_scope"() RETURNS trigger AS $$
BEGIN
  IF NEW."buildingId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Building" b WHERE b."id" = NEW."buildingId" AND b."societyId" = NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Utility meter building must belong to the same society';
  END IF;
  IF NEW."unitId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Unit" u WHERE u."id" = NEW."unitId" AND u."societyId" = NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Utility meter unit must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityMeter_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId", "buildingId", "unitId" ON "UtilityMeter"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_meter_scope"();

CREATE OR REPLACE FUNCTION "validate_utility_reading_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "UtilityMeter" m WHERE m."id" = NEW."meterId" AND m."societyId" = NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Utility reading meter must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityReading_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId", "meterId" ON "UtilityReading"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_reading_scope"();
