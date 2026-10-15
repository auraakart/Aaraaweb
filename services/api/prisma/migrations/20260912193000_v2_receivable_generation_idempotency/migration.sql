-- Prevent duplicate periodic/unit charge issuance even when callers vary an external source id.
CREATE UNIQUE INDEX "Receivable_society_rule_unit_period_key"
ON "Receivable" ("societyId", "chargeRuleId", "unitId", "billingPeriod")
WHERE "chargeRuleId" IS NOT NULL;
