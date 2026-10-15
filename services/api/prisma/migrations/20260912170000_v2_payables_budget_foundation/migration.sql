-- Aaraagate V2 finance operations foundation: expenses, payables and budgets.
-- Monetary values are stored in paise; accounting truth remains in JournalEntry/JournalLine.

CREATE TYPE "SocietyExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED', 'VOID');
CREATE TYPE "SocietyPayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');
CREATE TYPE "BudgetPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'LOCKED');

CREATE TABLE "SocietyExpense" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "expenseNumber" TEXT NOT NULL,
  "vendorName" TEXT NOT NULL,
  "invoiceReference" TEXT,
  "expenseDate" DATE NOT NULL,
  "dueDate" DATE,
  "description" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "SocietyExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "expenseAccountId" UUID NOT NULL,
  "fundId" UUID,
  "journalEntryId" UUID,
  "createdByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyExpense_amount_check" CHECK ("amountPaise" > 0),
  CONSTRAINT "SocietyExpense_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "SocietyExpense_due_check" CHECK ("dueDate" IS NULL OR "dueDate" >= "expenseDate"),
  CONSTRAINT "SocietyExpense_approval_state_check" CHECK (
    ("status" = 'DRAFT' AND "approvedAt" IS NULL AND "approvedByUserId" IS NULL)
    OR ("status" <> 'DRAFT' AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "SocietyExpense_society_number_key" ON "SocietyExpense"("societyId", "expenseNumber");
CREATE UNIQUE INDEX "SocietyExpense_id_society_key" ON "SocietyExpense"("id", "societyId");
CREATE UNIQUE INDEX "SocietyExpense_journal_key" ON "SocietyExpense"("journalEntryId") WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX "SocietyExpense_society_status_due_idx" ON "SocietyExpense"("societyId", "status", "dueDate");
CREATE INDEX "SocietyExpense_society_vendor_idx" ON "SocietyExpense"("societyId", "vendorName", "expenseDate" DESC);

ALTER TABLE "SocietyExpense"
  ADD CONSTRAINT "SocietyExpense_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SocietyExpense_account_society_fkey" FOREIGN KEY ("expenseAccountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "SocietyExpense_fund_society_fkey" FOREIGN KEY ("fundId", "societyId") REFERENCES "AccountingFund"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "SocietyExpense_journal_society_fkey" FOREIGN KEY ("journalEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "SocietyExpense_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SocietyExpense_approved_by_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE TABLE "SocietyPayable" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "expenseId" UUID NOT NULL,
  "payableAccountId" UUID NOT NULL,
  "originalAmountPaise" BIGINT NOT NULL,
  "status" "SocietyPayableStatus" NOT NULL DEFAULT 'OPEN',
  "dueDate" DATE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyPayable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyPayable_amount_check" CHECK ("originalAmountPaise" > 0)
);

CREATE UNIQUE INDEX "SocietyPayable_expense_key" ON "SocietyPayable"("expenseId");
CREATE UNIQUE INDEX "SocietyPayable_id_society_key" ON "SocietyPayable"("id", "societyId");
CREATE INDEX "SocietyPayable_society_status_due_idx" ON "SocietyPayable"("societyId", "status", "dueDate");

ALTER TABLE "SocietyPayable"
  ADD CONSTRAINT "SocietyPayable_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SocietyPayable_expense_society_fkey" FOREIGN KEY ("expenseId", "societyId") REFERENCES "SocietyExpense"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "SocietyPayable_account_society_fkey" FOREIGN KEY ("payableAccountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT;

CREATE TABLE "BudgetPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "status" "BudgetPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMPTZ(6),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetPlan_date_check" CHECK ("startsOn" <= "endsOn"),
  CONSTRAINT "BudgetPlan_approval_check" CHECK (
    ("status" = 'DRAFT' AND "approvedAt" IS NULL AND "approvedByUserId" IS NULL)
    OR ("status" <> 'DRAFT' AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "BudgetPlan_society_code_key" ON "BudgetPlan"("societyId", "code");
CREATE UNIQUE INDEX "BudgetPlan_id_society_key" ON "BudgetPlan"("id", "societyId");
CREATE INDEX "BudgetPlan_society_period_idx" ON "BudgetPlan"("societyId", "startsOn", "endsOn");

ALTER TABLE "BudgetPlan"
  ADD CONSTRAINT "BudgetPlan_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "BudgetPlan_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "BudgetPlan_approved_by_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE TABLE "BudgetLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "budgetPlanId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "fundId" UUID,
  "amountPaise" BIGINT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetLine_amount_check" CHECK ("amountPaise" >= 0)
);

CREATE UNIQUE INDEX "BudgetLine_plan_account_fund_key" ON "BudgetLine"(
  "budgetPlanId", "accountId", COALESCE("fundId", '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX "BudgetLine_society_plan_idx" ON "BudgetLine"("societyId", "budgetPlanId");

ALTER TABLE "BudgetLine"
  ADD CONSTRAINT "BudgetLine_plan_society_fkey" FOREIGN KEY ("budgetPlanId", "societyId") REFERENCES "BudgetPlan"("id", "societyId") ON DELETE CASCADE,
  ADD CONSTRAINT "BudgetLine_account_society_fkey" FOREIGN KEY ("accountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "BudgetLine_fund_society_fkey" FOREIGN KEY ("fundId", "societyId") REFERENCES "AccountingFund"("id", "societyId") ON DELETE RESTRICT;

-- Approved/posted expense economics are immutable. Corrections must be represented
-- through journal reversal/adjustment plus a new expense record where required.
CREATE OR REPLACE FUNCTION "prevent_final_expense_economic_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('APPROVED', 'POSTED') AND (
    NEW."societyId" IS DISTINCT FROM OLD."societyId" OR
    NEW."expenseNumber" IS DISTINCT FROM OLD."expenseNumber" OR
    NEW."vendorName" IS DISTINCT FROM OLD."vendorName" OR
    NEW."invoiceReference" IS DISTINCT FROM OLD."invoiceReference" OR
    NEW."expenseDate" IS DISTINCT FROM OLD."expenseDate" OR
    NEW."dueDate" IS DISTINCT FROM OLD."dueDate" OR
    NEW."description" IS DISTINCT FROM OLD."description" OR
    NEW."amountPaise" IS DISTINCT FROM OLD."amountPaise" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."expenseAccountId" IS DISTINCT FROM OLD."expenseAccountId" OR
    NEW."fundId" IS DISTINCT FROM OLD."fundId" OR
    NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId"
  ) THEN
    RAISE EXCEPTION 'Approved or posted expense economics are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SocietyExpense_final_immutable"
BEFORE UPDATE ON "SocietyExpense"
FOR EACH ROW EXECUTE FUNCTION "prevent_final_expense_economic_mutation"();

-- Approved/locked budgets are snapshots. Budget revisions are new plans, not edits.
CREATE OR REPLACE FUNCTION "prevent_final_budget_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('APPROVED', 'LOCKED') THEN
    RAISE EXCEPTION 'Approved or locked budget plans are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BudgetPlan_final_immutable"
BEFORE UPDATE OR DELETE ON "BudgetPlan"
FOR EACH ROW EXECUTE FUNCTION "prevent_final_budget_mutation"();

CREATE OR REPLACE FUNCTION "prevent_final_budget_line_mutation"() RETURNS trigger AS $$
DECLARE plan_status "BudgetPlanStatus";
BEGIN
  SELECT "status" INTO plan_status FROM "BudgetPlan" WHERE "id" = COALESCE(OLD."budgetPlanId", NEW."budgetPlanId");
  IF plan_status IN ('APPROVED', 'LOCKED') THEN
    RAISE EXCEPTION 'Lines of approved or locked budgets are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BudgetLine_final_immutable"
BEFORE UPDATE OR DELETE ON "BudgetLine"
FOR EACH ROW EXECUTE FUNCTION "prevent_final_budget_line_mutation"();
