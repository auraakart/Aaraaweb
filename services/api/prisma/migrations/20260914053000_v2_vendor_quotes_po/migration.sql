CREATE TABLE "ProcurementQuote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "quoteReference" VARCHAR(160),
  "amountPaise" BIGINT NOT NULL,
  "validUntil" DATE,
  "notes" VARCHAR(2000),
  "status" VARCHAR(16) NOT NULL DEFAULT 'RECEIVED',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementQuote_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "SocietyVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementQuote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementQuote_amount_check" CHECK ("amountPaise" >= 0),
  CONSTRAINT "ProcurementQuote_status_check" CHECK ("status" IN ('RECEIVED','SELECTED','REJECTED')),
  CONSTRAINT "ProcurementQuote_request_vendor_key" UNIQUE ("requestId", "vendorId")
);

CREATE INDEX "ProcurementQuote_society_request_idx" ON "ProcurementQuote"("societyId", "requestId", "amountPaise");

ALTER TABLE "ProcurementRequest" ADD COLUMN "selectedQuoteId" UUID;
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_selectedQuoteId_fkey" FOREIGN KEY ("selectedQuoteId") REFERENCES "ProcurementQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "poNumber" VARCHAR(64) NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "terms" VARCHAR(3000),
  "status" VARCHAR(16) NOT NULL DEFAULT 'ISSUED',
  "issuedByUserId" UUID NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrder_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ProcurementQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "SocietyVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_amount_check" CHECK ("amountPaise" >= 0),
  CONSTRAINT "PurchaseOrder_status_check" CHECK ("status" IN ('ISSUED','CANCELLED')),
  CONSTRAINT "PurchaseOrder_society_po_key" UNIQUE ("societyId", "poNumber"),
  CONSTRAINT "PurchaseOrder_request_key" UNIQUE ("requestId")
);

CREATE INDEX "PurchaseOrder_society_vendor_idx" ON "PurchaseOrder"("societyId", "vendorId", "issuedAt" DESC);
