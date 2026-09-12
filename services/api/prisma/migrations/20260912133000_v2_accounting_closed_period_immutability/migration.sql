-- Once an accounting period is closed, its dates, metadata and close evidence
-- become immutable. The OPEN -> CLOSED transition remains allowed exactly once.

DROP TRIGGER IF EXISTS "AccountingPeriod_prevent_reopen" ON "AccountingPeriod";
DROP FUNCTION IF EXISTS "aaraagate_prevent_closed_period_reopen"();

CREATE OR REPLACE FUNCTION "aaraagate_protect_closed_period"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed accounting period is immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed accounting period is immutable';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AccountingPeriod_protect_closed_update"
BEFORE UPDATE ON "AccountingPeriod"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_closed_period"();

CREATE TRIGGER "AccountingPeriod_protect_closed_delete"
BEFORE DELETE ON "AccountingPeriod"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_closed_period"();
