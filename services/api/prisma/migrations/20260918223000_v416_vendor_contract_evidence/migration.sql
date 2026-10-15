CREATE TABLE "SocietyVendorContract" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "contractNumber" VARCHAR(120) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "contractType" VARCHAR(32) NOT NULL DEFAULT 'SERVICE_AGREEMENT',
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "renewalNoticeDays" INTEGER NOT NULL DEFAULT 30,
  "slaReference" VARCHAR(1000),
  "documentReference" VARCHAR(1000),
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "notes" VARCHAR(2000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyVendorContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyVendorContract_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendorContract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "SocietyVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendorContract_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendorContract_type_check" CHECK ("contractType" IN ('AMC','SERVICE_AGREEMENT','SUPPLY','OTHER')),
  CONSTRAINT "SocietyVendorContract_status_check" CHECK ("status" IN ('ACTIVE','EXPIRED','TERMINATED')),
  CONSTRAINT "SocietyVendorContract_dates_check" CHECK ("endsOn" >= "startsOn"),
  CONSTRAINT "SocietyVendorContract_notice_check" CHECK ("renewalNoticeDays" >= 0 AND "renewalNoticeDays" <= 3650),
  CONSTRAINT "SocietyVendorContract_society_number_key" UNIQUE ("societyId","contractNumber")
);
CREATE INDEX "SocietyVendorContract_society_status_end_idx" ON "SocietyVendorContract"("societyId","status","endsOn");
CREATE INDEX "SocietyVendorContract_society_vendor_idx" ON "SocietyVendorContract"("societyId","vendorId","endsOn" DESC);

CREATE TABLE "SocietyVendorContractEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" VARCHAR(32) NOT NULL,
  "note" VARCHAR(1000),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyVendorContractEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyVendorContractEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendorContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SocietyVendorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendorContractEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocietyVendorContractEvent_type_check" CHECK ("eventType" IN ('CREATED','STATUS_UPDATED'))
);
CREATE INDEX "SocietyVendorContractEvent_society_contract_idx" ON "SocietyVendorContractEvent"("societyId","contractId","createdAt");

CREATE OR REPLACE FUNCTION prevent_society_vendor_contract_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Society vendor contract events are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SocietyVendorContractEvent_append_only_update" BEFORE UPDATE ON "SocietyVendorContractEvent" FOR EACH ROW EXECUTE FUNCTION prevent_society_vendor_contract_event_mutation();
CREATE TRIGGER "SocietyVendorContractEvent_append_only_delete" BEFORE DELETE ON "SocietyVendorContractEvent" FOR EACH ROW EXECUTE FUNCTION prevent_society_vendor_contract_event_mutation();
