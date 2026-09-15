ALTER TABLE "HelpdeskSlaPolicy"
  ADD COLUMN "escalationTargetUserId" UUID,
  ADD COLUMN "automaticEscalationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "HelpdeskSlaPolicy_escalationTargetUserId_fkey"
    FOREIGN KEY ("escalationTargetUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "HelpdeskSlaPolicy_auto_escalation_target_check"
    CHECK (NOT "automaticEscalationEnabled" OR "escalationTargetUserId" IS NOT NULL);

CREATE OR REPLACE FUNCTION validate_helpdesk_sla_policy_escalation_target() RETURNS trigger AS $$
BEGIN
  IF NEW."escalationTargetUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "SocietyMembership" sm
    WHERE sm."societyId" = NEW."societyId"
      AND sm."userId" = NEW."escalationTargetUserId"
      AND sm."active" = true
  ) THEN
    RAISE EXCEPTION 'Helpdesk SLA escalation target must be an active member of the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER helpdesk_sla_policy_escalation_target_guard
BEFORE INSERT OR UPDATE OF "societyId", "escalationTargetUserId" ON "HelpdeskSlaPolicy"
FOR EACH ROW EXECUTE FUNCTION validate_helpdesk_sla_policy_escalation_target();

CREATE INDEX "HelpdeskSlaPolicy_society_auto_escalation_idx"
  ON "HelpdeskSlaPolicy"("societyId", "automaticEscalationEnabled", "active")
  WHERE "automaticEscalationEnabled" = true AND "active" = true;
