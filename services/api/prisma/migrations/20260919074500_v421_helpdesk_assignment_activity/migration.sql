ALTER TABLE "HelpdeskActivity" DROP CONSTRAINT IF EXISTS "HelpdeskActivity_type_check";
ALTER TABLE "HelpdeskActivity"
  ADD CONSTRAINT "HelpdeskActivity_type_check"
  CHECK ("type" IN ('CREATED','COMMENT','INTERNAL_NOTE','STATUS_CHANGED','REOPENED','ASSIGNED'));
