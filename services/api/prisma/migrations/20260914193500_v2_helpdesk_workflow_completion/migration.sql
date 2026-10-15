ALTER TABLE "HelpdeskTicket"
  ADD COLUMN IF NOT EXISTS "resolutionCode" TEXT,
  ADD COLUMN IF NOT EXISTS "closureCode" TEXT;

ALTER TABLE "HelpdeskTicket"
  ADD CONSTRAINT "HelpdeskTicket_resolution_code_check"
    CHECK ("resolutionCode" IS NULL OR "resolutionCode" IN ('FIXED','WORKAROUND','DUPLICATE','NOT_REPRODUCIBLE','REQUEST_WITHDRAWN','OTHER')) NOT VALID,
  ADD CONSTRAINT "HelpdeskTicket_closure_code_check"
    CHECK ("closureCode" IS NULL OR "closureCode" IN ('RESOLVED_CONFIRMED','RESIDENT_CONFIRMED','DUPLICATE','INVALID_REQUEST','REQUEST_WITHDRAWN','OTHER')) NOT VALID,
  ADD CONSTRAINT "HelpdeskTicket_resolved_requires_code_check"
    CHECK ("status" <> 'RESOLVED' OR "resolutionCode" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "HelpdeskTicket_closed_requires_code_check"
    CHECK ("status" <> 'CLOSED' OR "closureCode" IS NOT NULL) NOT VALID;

ALTER TABLE "HelpdeskActivity" DROP CONSTRAINT IF EXISTS "HelpdeskActivity_type_check";
ALTER TABLE "HelpdeskActivity"
  ADD CONSTRAINT "HelpdeskActivity_type_check"
    CHECK ("type" IN ('CREATED','COMMENT','INTERNAL_NOTE','STATUS_CHANGED','REOPENED'));

CREATE INDEX IF NOT EXISTS "HelpdeskTicket_society_resolution_code_idx"
  ON "HelpdeskTicket" ("societyId", "resolutionCode") WHERE "resolutionCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "HelpdeskTicket_society_closure_code_idx"
  ON "HelpdeskTicket" ("societyId", "closureCode") WHERE "closureCode" IS NOT NULL;
