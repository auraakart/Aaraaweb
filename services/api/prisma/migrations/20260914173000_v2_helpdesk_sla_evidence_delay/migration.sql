CREATE OR REPLACE FUNCTION helpdesk_capture_first_response() RETURNS trigger AS $$
DECLARE
  prior_response TIMESTAMPTZ;
  ticket_state TEXT;
BEGIN
  IF NEW."type"='STATUS_CHANGED' AND NEW."toStatus" IN ('IN_PROGRESS','RESOLVED','CLOSED') THEN
    SELECT "firstRespondedAt", "slaState"
      INTO prior_response, ticket_state
    FROM "HelpdeskTicket"
    WHERE "id"=NEW."ticketId" AND "societyId"=NEW."societyId"
    FOR UPDATE;

    IF prior_response IS NULL THEN
      UPDATE "HelpdeskTicket"
      SET "firstRespondedAt"=NEW."occurredAt", "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=NEW."ticketId" AND "societyId"=NEW."societyId";

      INSERT INTO "HelpdeskSlaEvent" (
        "societyId","ticketId","actorUserId","eventType","fromState","toState","note","createdAt"
      ) VALUES (
        NEW."societyId", NEW."ticketId", NEW."actorUserId", 'FIRST_RESPONSE', ticket_state, ticket_state,
        'First operational response recorded', NEW."occurredAt"
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_helpdesk_escalation_delay() RETURNS trigger AS $$
DECLARE
  delay_minutes INTEGER;
  eligible_at TIMESTAMPTZ;
BEGIN
  IF NEW."escalationLevel" <= OLD."escalationLevel" THEN
    RETURN NEW;
  END IF;

  SELECT p."escalationAfterMinutes"
    INTO delay_minutes
  FROM "HelpdeskSlaPolicy" p
  WHERE p."societyId"=OLD."societyId"
    AND p."priority"=OLD."priority"
    AND p."active"=true
  LIMIT 1;

  IF delay_minutes IS NULL THEN
    RAISE EXCEPTION 'Active SLA policy required before escalation';
  END IF;

  IF OLD."lastEscalatedAt" IS NOT NULL THEN
    eligible_at := OLD."lastEscalatedAt" + make_interval(mins => delay_minutes);
  ELSIF OLD."slaState"='RESOLUTION_BREACHED' AND OLD."resolutionDueAt" IS NOT NULL THEN
    eligible_at := OLD."resolutionDueAt" + make_interval(mins => delay_minutes);
  ELSIF OLD."slaState"='RESPONSE_BREACHED' AND OLD."firstResponseDueAt" IS NOT NULL THEN
    eligible_at := OLD."firstResponseDueAt" + make_interval(mins => delay_minutes);
  ELSE
    RAISE EXCEPTION 'Only breached SLA tickets can be escalated';
  END IF;

  IF CURRENT_TIMESTAMP < eligible_at THEN
    RAISE EXCEPTION 'Configured SLA escalation delay has not elapsed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER helpdesk_ticket_escalation_delay_guard
BEFORE UPDATE OF "escalationLevel" ON "HelpdeskTicket"
FOR EACH ROW EXECUTE FUNCTION enforce_helpdesk_escalation_delay();
