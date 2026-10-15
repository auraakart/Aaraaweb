-- Aaraagate V3.4 society-services timeline and warranty projection.
-- This intentionally keeps ServiceBooking as the source of truth while adding
-- append-only operational history for resident UX and support investigations.

CREATE TABLE "SocietyServiceBookingEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "actorUserId" UUID,
  "accessRequestId" UUID,
  "action" TEXT NOT NULL,
  "fromStatus" "ServiceBookingStatus",
  "toStatus" "ServiceBookingStatus",
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyServiceBookingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyServiceBookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyServiceBookingEvent_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "AccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SocietyServiceBookingEvent_booking_action_key"
  ON "SocietyServiceBookingEvent"("bookingId", "action");
CREATE INDEX "SocietyServiceBookingEvent_society_booking_time_idx"
  ON "SocietyServiceBookingEvent"("societyId", "bookingId", "occurredAt");

CREATE TABLE "SocietyServiceWarrantySnapshot" (
  "bookingId" UUID NOT NULL,
  "warrantyDays" INTEGER,
  "revisitPolicy" TEXT,
  "warrantyStartedAt" TIMESTAMPTZ(6),
  "warrantyUntil" TIMESTAMPTZ(6),
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyServiceWarrantySnapshot_pkey" PRIMARY KEY ("bookingId"),
  CONSTRAINT "SocietyServiceWarrantySnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyServiceWarrantySnapshot_warrantyDays_check" CHECK ("warrantyDays" IS NULL OR "warrantyDays" >= 0)
);

CREATE OR REPLACE FUNCTION "aaraagate_project_society_service_booking_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_action := 'BOOKING_REQUESTED';
    INSERT INTO "SocietyServiceBookingEvent" (
      "societyId", "bookingId", "action", "fromStatus", "toStatus", "occurredAt"
    ) VALUES (
      NEW."societyId", NEW."id", event_action, NULL, NEW."status", COALESCE(NEW."createdAt", CURRENT_TIMESTAMP)
    ) ON CONFLICT ("bookingId", "action") DO NOTHING;
    RETURN NEW;
  END IF;

  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  event_action := CASE NEW."status"
    WHEN 'CONFIRMED'::"ServiceBookingStatus" THEN 'PROVIDER_CONFIRMED'
    WHEN 'IN_PROGRESS'::"ServiceBookingStatus" THEN 'SERVICE_IN_PROGRESS'
    WHEN 'COMPLETED'::"ServiceBookingStatus" THEN 'SERVICE_COMPLETED'
    WHEN 'CANCELLED'::"ServiceBookingStatus" THEN 'BOOKING_CANCELLED'
    ELSE 'STATUS_CHANGED'
  END;

  INSERT INTO "SocietyServiceBookingEvent" (
    "societyId", "bookingId", "accessRequestId", "action", "fromStatus", "toStatus", "occurredAt"
  ) VALUES (
    NEW."societyId", NEW."id", NEW."accessRequestId", event_action, OLD."status", NEW."status", CURRENT_TIMESTAMP
  ) ON CONFLICT ("bookingId", "action") DO NOTHING;

  IF NEW."status" = 'COMPLETED'::"ServiceBookingStatus" THEN
    INSERT INTO "SocietyServiceWarrantySnapshot" (
      "bookingId", "warrantyDays", "revisitPolicy", "warrantyStartedAt", "warrantyUntil", "capturedAt"
    )
    SELECT
      NEW."id",
      p."warrantyDays",
      p."revisitPolicy",
      CURRENT_TIMESTAMP,
      CASE
        WHEN p."warrantyDays" IS NULL THEN NULL
        ELSE CURRENT_TIMESTAMP + make_interval(days => p."warrantyDays")
      END,
      CURRENT_TIMESTAMP
    FROM "ServiceOfferingContinuityPolicy" p
    WHERE p."offeringId" = NEW."offeringId"
      AND (p."warrantyDays" IS NOT NULL OR NULLIF(BTRIM(p."revisitPolicy"), '') IS NOT NULL)
    ON CONFLICT ("bookingId") DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SocietyServiceBooking_event_projection" ON "ServiceBooking";
CREATE TRIGGER "SocietyServiceBooking_event_projection"
AFTER INSERT OR UPDATE OF "status" ON "ServiceBooking"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_project_society_service_booking_event"();

CREATE OR REPLACE FUNCTION "aaraagate_project_service_gate_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_row RECORD;
  previous_status "ServiceBookingStatus";
  projected_status "ServiceBookingStatus";
  event_action TEXT;
BEGIN
  SELECT b."id", b."societyId", b."status", b."accessRequestId"
    INTO booking_row
  FROM "ServiceBooking" b
  WHERE b."accessRequestId" = NEW."accessRequestId"
    AND b."societyId" = NEW."societyId"
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  previous_status := booking_row."status";
  projected_status := booking_row."status";

  IF NEW."action" = 'CHECK_IN'::"GateMutationAction" THEN
    event_action := 'PROVIDER_GATE_CHECKED_IN';
    IF booking_row."status" = 'CONFIRMED'::"ServiceBookingStatus" THEN
      UPDATE "ServiceBooking"
      SET "status" = 'IN_PROGRESS'::"ServiceBookingStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = booking_row."id"
        AND "societyId" = NEW."societyId"
        AND "status" = 'CONFIRMED'::"ServiceBookingStatus";
      projected_status := 'IN_PROGRESS'::"ServiceBookingStatus";
    END IF;
  ELSIF NEW."action" = 'CHECK_OUT'::"GateMutationAction" THEN
    event_action := 'PROVIDER_GATE_CHECKED_OUT';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO "SocietyServiceBookingEvent" (
    "societyId", "bookingId", "actorUserId", "accessRequestId", "action", "fromStatus", "toStatus", "metadata", "occurredAt"
  ) VALUES (
    NEW."societyId",
    booking_row."id",
    NEW."actorUserId",
    NEW."accessRequestId",
    event_action,
    previous_status,
    projected_status,
    jsonb_build_object('gateId', NEW."gateId", 'idempotencyKey', NEW."idempotencyKey"),
    COALESCE(NEW."createdAt", CURRENT_TIMESTAMP)
  ) ON CONFLICT ("bookingId", "action") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceBooking_gate_event_projection" ON "GateMutationReceipt";
CREATE TRIGGER "ServiceBooking_gate_event_projection"
AFTER INSERT ON "GateMutationReceipt"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_project_service_gate_event"();
