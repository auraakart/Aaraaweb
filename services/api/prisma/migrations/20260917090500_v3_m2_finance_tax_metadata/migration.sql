-- Aaraagate V3.2 configurable statutory metadata.
-- GST/TDS are opt-in society configuration. This migration intentionally does
-- not assume that every society, charge or vendor transaction is taxable.

CREATE TABLE "SocietyTaxConfiguration" (
  "societyId" UUID NOT NULL,
  "gstEnabled" BOOLEAN NOT NULL DEFAULT false,
  "gstin" TEXT,
  "tdsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "tan" TEXT,
  "defaultTdsSection" TEXT,
  "defaultTdsBasisPoints" INTEGER,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyTaxConfiguration_pkey" PRIMARY KEY ("societyId"),
  CONSTRAINT "SocietyTaxConfiguration_tds_rate_valid" CHECK ("defaultTdsBasisPoints" IS NULL OR ("defaultTdsBasisPoints" >= 0 AND "defaultTdsBasisPoints" <= 10000)),
  CONSTRAINT "SocietyTaxConfiguration_gst_state_valid" CHECK ("gstEnabled" OR "gstin" IS NULL),
  CONSTRAINT "SocietyTaxConfiguration_tds_state_valid" CHECK ("tdsEnabled" OR ("tan" IS NULL AND "defaultTdsSection" IS NULL AND "defaultTdsBasisPoints" IS NULL))
);

ALTER TABLE "SocietyTaxConfiguration"
  ADD CONSTRAINT "SocietyTaxConfiguration_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocietyTaxConfiguration"
  ADD CONSTRAINT "SocietyTaxConfiguration_updated_by_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinanceTaxDocumentMetadata" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "taxableAmountPaise" BIGINT,
  "gstRateBasisPoints" INTEGER,
  "gstAmountPaise" BIGINT,
  "vendorGstin" TEXT,
  "invoiceNumber" TEXT,
  "tdsSection" TEXT,
  "tdsRateBasisPoints" INTEGER,
  "tdsAmountPaise" BIGINT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxDocumentMetadata_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceTaxDocumentMetadata_type_valid" CHECK ("documentType" IN ('EXPENSE','CHARGE_RULE','RECEIVABLE')),
  CONSTRAINT "FinanceTaxDocumentMetadata_taxable_nonnegative" CHECK ("taxableAmountPaise" IS NULL OR "taxableAmountPaise" >= 0),
  CONSTRAINT "FinanceTaxDocumentMetadata_gst_rate_valid" CHECK ("gstRateBasisPoints" IS NULL OR ("gstRateBasisPoints" >= 0 AND "gstRateBasisPoints" <= 10000)),
  CONSTRAINT "FinanceTaxDocumentMetadata_gst_amount_nonnegative" CHECK ("gstAmountPaise" IS NULL OR "gstAmountPaise" >= 0),
  CONSTRAINT "FinanceTaxDocumentMetadata_tds_rate_valid" CHECK ("tdsRateBasisPoints" IS NULL OR ("tdsRateBasisPoints" >= 0 AND "tdsRateBasisPoints" <= 10000)),
  CONSTRAINT "FinanceTaxDocumentMetadata_tds_amount_nonnegative" CHECK ("tdsAmountPaise" IS NULL OR "tdsAmountPaise" >= 0)
);

CREATE UNIQUE INDEX "FinanceTaxDocumentMetadata_document_key" ON "FinanceTaxDocumentMetadata" ("societyId","documentType","documentId");
CREATE UNIQUE INDEX "FinanceTaxDocumentMetadata_id_society_key" ON "FinanceTaxDocumentMetadata" ("id","societyId");
CREATE INDEX "FinanceTaxDocumentMetadata_society_type_idx" ON "FinanceTaxDocumentMetadata" ("societyId","documentType");

ALTER TABLE "FinanceTaxDocumentMetadata"
  ADD CONSTRAINT "FinanceTaxDocumentMetadata_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceTaxDocumentMetadata"
  ADD CONSTRAINT "FinanceTaxDocumentMetadata_updated_by_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
