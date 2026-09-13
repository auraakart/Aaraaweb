CREATE TABLE "FacilityWorkOrderEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "workOrderId" UUID NOT NULL,
  "eventType" VARCHAR(48) NOT NULL,
  "fromStatus" VARCHAR(32),
  "toStatus" VARCHAR(32),
  "note" TEXT,
  "actorUserId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityWorkOrderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityWorkOrderEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrderEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "FacilityWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrderEvent_type_check" CHECK ("eventType" IN ('CREATED','STATUS_CHANGED'))
);
CREATE INDEX "FacilityWorkOrderEvent_society_work_order_idx" ON "FacilityWorkOrderEvent"("societyId","workOrderId","occurredAt" DESC);

CREATE OR REPLACE FUNCTION prevent_facility_work_order_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FacilityWorkOrderEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FacilityWorkOrderEvent_no_update"
BEFORE UPDATE ON "FacilityWorkOrderEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_facility_work_order_event_mutation();

CREATE TRIGGER "FacilityWorkOrderEvent_no_delete"
BEFORE DELETE ON "FacilityWorkOrderEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_facility_work_order_event_mutation();
