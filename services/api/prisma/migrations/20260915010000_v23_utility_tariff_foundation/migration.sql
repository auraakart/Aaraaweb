CREATE TABLE "UtilityTariffPlan" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "meterType" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "fixedChargePaise" INTEGER NOT NULL DEFAULT 0,
  "minimumChargePaise" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id"),
  "activatedByUserId" UUID REFERENCES "User"("id"),
  "activatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityTariffPlan_code_nonblank" CHECK (length(btrim("code")) > 0),
  CONSTRAINT "UtilityTariffPlan_name_nonblank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "UtilityTariffPlan_meterType_check" CHECK ("meterType" IN ('ELECTRICITY','WATER','DG','GAS','OTHER')),
  CONSTRAINT "UtilityTariffPlan_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','RETIRED')),
  CONSTRAINT "UtilityTariffPlan_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "UtilityTariffPlan_fixed_nonnegative" CHECK ("fixedChargePaise" >= 0),
  CONSTRAINT "UtilityTariffPlan_minimum_nonnegative" CHECK ("minimumChargePaise" >= 0)
);

CREATE UNIQUE INDEX "UtilityTariffPlan_society_code_key" ON "UtilityTariffPlan"("societyId", "code");
CREATE INDEX "UtilityTariffPlan_society_type_status_idx" ON "UtilityTariffPlan"("societyId", "meterType", "status", "effectiveFrom" DESC);

CREATE TABLE "UtilityTariffSlab" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "planId" UUID NOT NULL REFERENCES "UtilityTariffPlan"("id") ON DELETE CASCADE,
  "sequence" INTEGER NOT NULL,
  "fromUnit" NUMERIC(18,6) NOT NULL,
  "toUnit" NUMERIC(18,6),
  "ratePaisePerUnit" NUMERIC(18,6) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityTariffSlab_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "UtilityTariffSlab_from_nonnegative" CHECK ("fromUnit" >= 0),
  CONSTRAINT "UtilityTariffSlab_to_valid" CHECK ("toUnit" IS NULL OR "toUnit" > "fromUnit"),
  CONSTRAINT "UtilityTariffSlab_rate_nonnegative" CHECK ("ratePaisePerUnit" >= 0)
);

CREATE UNIQUE INDEX "UtilityTariffSlab_plan_sequence_key" ON "UtilityTariffSlab"("planId", "sequence");
CREATE UNIQUE INDEX "UtilityTariffSlab_plan_from_key" ON "UtilityTariffSlab"("planId", "fromUnit");

CREATE TABLE "UtilityTariffEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "planId" UUID REFERENCES "UtilityTariffPlan"("id") ON DELETE SET NULL,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityTariffEvent_action_check" CHECK ("action" IN ('TARIFF_CREATED','TARIFF_ACTIVATED','TARIFF_RETIRED'))
);

CREATE INDEX "UtilityTariffEvent_society_time_idx" ON "UtilityTariffEvent"("societyId", "occurredAt" DESC);

CREATE OR REPLACE FUNCTION "validate_utility_tariff_slab_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "UtilityTariffPlan" p WHERE p."id" = NEW."planId" AND p."societyId" = NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Utility tariff slab plan must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityTariffSlab_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId", "planId" ON "UtilityTariffSlab"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_tariff_slab_scope"();

CREATE OR REPLACE FUNCTION "validate_utility_tariff_active_window"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'ACTIVE' AND EXISTS (
    SELECT 1
    FROM "UtilityTariffPlan" p
    WHERE p."societyId" = NEW."societyId"
      AND p."meterType" = NEW."meterType"
      AND p."status" = 'ACTIVE'
      AND p."id" <> NEW."id"
      AND daterange(p."effectiveFrom", COALESCE(p."effectiveTo", 'infinity'::date), '[)')
          && daterange(NEW."effectiveFrom", COALESCE(NEW."effectiveTo", 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'Active utility tariff effective window overlaps another active plan';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityTariffPlan_active_window_guard"
BEFORE INSERT OR UPDATE OF "status", "effectiveFrom", "effectiveTo", "meterType", "societyId" ON "UtilityTariffPlan"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_tariff_active_window"();
