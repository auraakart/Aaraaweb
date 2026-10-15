CREATE TABLE "SocietyVendor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "contactName" VARCHAR(160),
  "phone" VARCHAR(40),
  "email" VARCHAR(320),
  "gstin" VARCHAR(32),
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "notes" VARCHAR(1000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyVendor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyVendor_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendor_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendor_status_check" CHECK ("status" IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  CONSTRAINT "SocietyVendor_society_code_key" UNIQUE ("societyId", "code")
);
CREATE INDEX "SocietyVendor_society_status_idx" ON "SocietyVendor"("societyId", "status", "name");

CREATE TABLE "ProcurementRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestNumber" VARCHAR(64) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(2000),
  "estimatedAmountPaise" BIGINT NOT NULL,
  "preferredVendorId" UUID,
  "sourceType" VARCHAR(64),
  "sourceId" UUID,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "requestedByUserId" UUID NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "rejectedByUserId" UUID,
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementRequest_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "SocietyVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT "ProcurementRequest_amount_check" CHECK ("estimatedAmountPaise" >= 0),
  CONSTRAINT "ProcurementRequest_society_number_key" UNIQUE ("societyId", "requestNumber")
);
CREATE INDEX "ProcurementRequest_society_status_idx" ON "ProcurementRequest"("societyId", "status", "createdAt" DESC);
CREATE INDEX "ProcurementRequest_society_vendor_idx" ON "ProcurementRequest"("societyId", "preferredVendorId", "createdAt" DESC);

CREATE TABLE "ProcurementRequestEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" VARCHAR(32) NOT NULL,
  "note" VARCHAR(1000),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementRequestEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementRequestEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequestEvent_type_check" CHECK ("eventType" IN ('CREATED','SUBMITTED','APPROVED','REJECTED','CANCELLED'))
);
CREATE INDEX "ProcurementRequestEvent_society_request_idx" ON "ProcurementRequestEvent"("societyId", "requestId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_procurement_request_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Procurement request events are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProcurementRequestEvent_append_only_update" BEFORE UPDATE ON "ProcurementRequestEvent" FOR EACH ROW EXECUTE FUNCTION prevent_procurement_request_event_mutation();
CREATE TRIGGER "ProcurementRequestEvent_append_only_delete" BEFORE DELETE ON "ProcurementRequestEvent" FOR EACH ROW EXECUTE FUNCTION prevent_procurement_request_event_mutation();
