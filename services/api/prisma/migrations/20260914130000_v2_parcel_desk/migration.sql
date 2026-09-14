CREATE TABLE "ParcelRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "carrier" TEXT,
  "trackingReference" TEXT,
  "recipientName" TEXT,
  "packageType" TEXT NOT NULL DEFAULT 'PACKAGE',
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "notes" TEXT,
  "receivedByUserId" UUID NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "collectedByUserId" UUID,
  "collectedAt" TIMESTAMPTZ,
  "returnedByUserId" UUID,
  "returnedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParcelRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParcelRecord_package_type_check" CHECK ("packageType" IN ('PACKAGE','DOCUMENT','FOOD','OTHER')),
  CONSTRAINT "ParcelRecord_status_check" CHECK ("status" IN ('RECEIVED','COLLECTED','RETURNED')),
  CONSTRAINT "ParcelRecord_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelRecord_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParcelRecord_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParcelRecord_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParcelRecord_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "ParcelRecord_society_status_received_idx" ON "ParcelRecord"("societyId", "status", "receivedAt" DESC);
CREATE INDEX "ParcelRecord_unit_received_idx" ON "ParcelRecord"("unitId", "receivedAt" DESC);

CREATE TABLE "ParcelRecipient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "parcelId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "recipientType" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParcelRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParcelRecipient_type_check" CHECK ("recipientType" IN ('OCCUPANT','OWNER_FALLBACK')),
  CONSTRAINT "ParcelRecipient_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelRecipient_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "ParcelRecord"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelRecipient_parcel_user_key" UNIQUE ("parcelId", "userId")
);

CREATE INDEX "ParcelRecipient_user_created_idx" ON "ParcelRecipient"("userId", "createdAt" DESC);

CREATE TABLE "ParcelEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "parcelId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParcelEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParcelEvent_action_check" CHECK ("action" IN ('RECEIVED','READ','COLLECTED','RETURNED')),
  CONSTRAINT "ParcelEvent_status_check" CHECK (
    ("fromStatus" IS NULL OR "fromStatus" IN ('RECEIVED','COLLECTED','RETURNED')) AND
    ("toStatus" IS NULL OR "toStatus" IN ('RECEIVED','COLLECTED','RETURNED'))
  ),
  CONSTRAINT "ParcelEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelEvent_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "ParcelRecord"("id") ON DELETE CASCADE,
  CONSTRAINT "ParcelEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "ParcelEvent_parcel_time_idx" ON "ParcelEvent"("parcelId", "occurredAt" ASC);

CREATE OR REPLACE FUNCTION prevent_parcel_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ParcelEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParcelEvent_no_update"
BEFORE UPDATE ON "ParcelEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_parcel_event_mutation();

CREATE TRIGGER "ParcelEvent_no_delete"
BEFORE DELETE ON "ParcelEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_parcel_event_mutation();
