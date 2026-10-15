-- Tighten budget snapshot immutability while allowing the intended one-way
-- APPROVED -> LOCKED lifecycle transition.

CREATE OR REPLACE FUNCTION "prevent_final_budget_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('APPROVED', 'LOCKED') THEN
      RAISE EXCEPTION 'Approved or locked budget plans are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'LOCKED' THEN
    RAISE EXCEPTION 'Locked budget plans are immutable';
  END IF;

  IF OLD."status" = 'APPROVED' THEN
    IF NEW."status" <> 'LOCKED'
       OR NEW."societyId" IS DISTINCT FROM OLD."societyId"
       OR NEW."code" IS DISTINCT FROM OLD."code"
       OR NEW."name" IS DISTINCT FROM OLD."name"
       OR NEW."startsOn" IS DISTINCT FROM OLD."startsOn"
       OR NEW."endsOn" IS DISTINCT FROM OLD."endsOn"
       OR NEW."approvedByUserId" IS DISTINCT FROM OLD."approvedByUserId"
       OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Approved budget economics are immutable; only locking is allowed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "prevent_final_budget_line_mutation"() RETURNS trigger AS $$
DECLARE
  plan_id UUID;
  plan_status "BudgetPlanStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    plan_id := OLD."budgetPlanId";
  ELSE
    plan_id := NEW."budgetPlanId";
  END IF;

  SELECT "status" INTO plan_status FROM "BudgetPlan" WHERE "id" = plan_id;
  IF plan_status IN ('APPROVED', 'LOCKED') THEN
    RAISE EXCEPTION 'Lines of approved or locked budgets are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
