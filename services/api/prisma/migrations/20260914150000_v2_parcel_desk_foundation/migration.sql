CREATE TABLE "Parcel" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "courierName" TEXT,
  "trackingReference" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "receivedByUserId" UUID NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "collectedByUserId" UUID,
  "collectedAt" TIMESTAMPTZ,
  "returnedByUserId" UUID,
  "returnedAt" TIMESTAMPTZ,
  "returnReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Parcel_status_check" CHECK ("status" IN ('RECEIVED','COLLECTED','RETURNED')),
  CONSTRAINT "Parcel_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "Parcel_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT,
  CONSTRAINT "Parcel_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "Parcel_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "Parcel_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "Parcel_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Parcel_society_tracking_unique" ON "Parcel"("societyId","trackingReference") WHERE "trackingReference" IS NOT NULL;
CREATE INDEX "Parcel_society_status_received_idx" ON "Parcel"("societyId","status","receivedAt" DESC);
CREATE INDEX "Parcel_recipient_status_received_idx" ON "Parcel"("recipientUserId","status","receivedAt" DESC);
CREATE INDEX "Parcel_unit_received_idx" ON "Parcel"("unitId","receivedAt" DESC);

CREATE TABLE "ParcelEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "parcelId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParcelEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParcelEvent_action_check" CHECK ("action" IN ('RECEIVED','COLLECTED','RETURNED')),
  CONSTRAINT "ParcelEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelEvent_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "ParcelEvent_parcel_time_idx" ON "ParcelEvent"("parcelId","occurredAt" ASC);

CREATE OR REPLACE FUNCTION prevent_parcel_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ParcelEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParcelEvent_append_only_update"
BEFORE UPDATE ON "ParcelEvent" FOR EACH ROW EXECUTE FUNCTION prevent_parcel_event_mutation();
CREATE TRIGGER "ParcelEvent_append_only_delete"
BEFORE DELETE ON "ParcelEvent" FOR EACH ROW EXECUTE FUNCTION prevent_parcel_event_mutation();