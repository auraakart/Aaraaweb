CREATE TABLE "UtilityChargeDraft" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "unitId" UUID NOT NULL REFERENCES "Unit"("id") ON DELETE CASCADE,
  "meterId" UUID NOT NULL REFERENCES "UtilityMeter"("id") ON DELETE CASCADE,
  "openingReadingId" UUID NOT NULL REFERENCES "UtilityReading"("id"),
  "closingReadingId" UUID NOT NULL REFERENCES "UtilityReading"("id"),
  "tariffPlanId" UUID NOT NULL REFERENCES "UtilityTariffPlan"("id"),
  "periodStart" TIMESTAMPTZ NOT NULL,
  "periodEnd" TIMESTAMPTZ NOT NULL,
  "consumption" NUMERIC(18,6) NOT NULL,
  "variableChargePaise" INTEGER NOT NULL,
  "fixedChargePaise" INTEGER NOT NULL,
  "minimumChargePaise" INTEGER NOT NULL,
  "totalPaise" INTEGER NOT NULL,
  "calculationJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id"),
  "voidedByUserId" UUID REFERENCES "User"("id"),
  "voidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityChargeDraft_period_check" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "UtilityChargeDraft_consumption_nonnegative" CHECK ("consumption" >= 0),
  CONSTRAINT "UtilityChargeDraft_amounts_nonnegative" CHECK (
    "variableChargePaise" >= 0 AND "fixedChargePaise" >= 0 AND "minimumChargePaise" >= 0 AND "totalPaise" >= 0
  ),
  CONSTRAINT "UtilityChargeDraft_status_check" CHECK ("status" IN ('DRAFT','VOID')),
  CONSTRAINT "UtilityChargeDraft_readings_different" CHECK ("openingReadingId" <> "closingReadingId")
);

CREATE UNIQUE INDEX "UtilityChargeDraft_interval_key"
  ON "UtilityChargeDraft"("societyId","meterId","openingReadingId","closingReadingId");
CREATE INDEX "UtilityChargeDraft_society_status_created_idx"
  ON "UtilityChargeDraft"("societyId","status","createdAt" DESC);
CREATE INDEX "UtilityChargeDraft_unit_created_idx"
  ON "UtilityChargeDraft"("societyId","unitId","createdAt" DESC);

CREATE TABLE "UtilityChargeEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "draftId" UUID NOT NULL REFERENCES "UtilityChargeDraft"("id") ON DELETE CASCADE,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityChargeEvent_action_check" CHECK ("action" IN ('DRAFT_CREATED','DRAFT_VOIDED'))
);

CREATE INDEX "UtilityChargeEvent_society_time_idx" ON "UtilityChargeEvent"("societyId","occurredAt" DESC);

CREATE OR REPLACE FUNCTION "validate_utility_charge_draft_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Unit" u WHERE u."id"=NEW."unitId" AND u."societyId"=NEW."societyId"
  ) THEN RAISE EXCEPTION 'Utility charge unit must belong to the same society'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "UtilityMeter" m
    WHERE m."id"=NEW."meterId" AND m."societyId"=NEW."societyId" AND m."unitId"=NEW."unitId"
  ) THEN RAISE EXCEPTION 'Utility charge meter must belong to the same society and unit'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "UtilityReading" o
    WHERE o."id"=NEW."openingReadingId" AND o."societyId"=NEW."societyId" AND o."meterId"=NEW."meterId" AND o."readingKind"='ACTUAL'
      AND o."readingAt"=NEW."periodStart"
  ) THEN RAISE EXCEPTION 'Utility charge opening reading is invalid'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "UtilityReading" c
    WHERE c."id"=NEW."closingReadingId" AND c."societyId"=NEW."societyId" AND c."meterId"=NEW."meterId" AND c."readingKind"='ACTUAL'
      AND c."readingAt"=NEW."periodEnd"
  ) THEN RAISE EXCEPTION 'Utility charge closing reading is invalid'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "UtilityTariffPlan" p
    JOIN "UtilityMeter" m ON m."id"=NEW."meterId" AND m."societyId"=NEW."societyId"
    WHERE p."id"=NEW."tariffPlanId" AND p."societyId"=NEW."societyId" AND p."meterType"=m."meterType" AND p."status"='ACTIVE'
  ) THEN RAISE EXCEPTION 'Utility charge tariff is invalid'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityChargeDraft_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId","unitId","meterId","openingReadingId","closingReadingId","tariffPlanId","periodStart","periodEnd"
ON "UtilityChargeDraft"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_charge_draft_scope"();
