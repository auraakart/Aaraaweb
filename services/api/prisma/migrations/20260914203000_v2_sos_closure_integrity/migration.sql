CREATE OR REPLACE FUNCTION validate_sos_event_integrity()
RETURNS trigger AS $$
DECLARE current_status "SosStatus";
BEGIN
  IF NEW."action"='RESOLVED' AND (NEW."note" IS NULL OR btrim(NEW."note")='') THEN
    RAISE EXCEPTION 'Resolved SOS incidents require closure evidence';
  END IF;

  IF NEW."action"='ESCALATED' THEN
    SELECT "status" INTO current_status
    FROM "SosIncident"
    WHERE "id"=NEW."incidentId" AND "societyId"=NEW."societyId"
    FOR SHARE;

    IF current_status IS NULL OR current_status NOT IN ('ACTIVE','ACKNOWLEDGED') THEN
      RAISE EXCEPTION 'Only active or acknowledged SOS incidents can be escalated';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SosIncidentEvent_integrity_guard"
BEFORE INSERT ON "SosIncidentEvent"
FOR EACH ROW EXECUTE FUNCTION validate_sos_event_integrity();
