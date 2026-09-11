CREATE TABLE "ServiceOfferingContinuityPolicy" (
  "offeringId" UUID NOT NULL,
  "warrantyDays" INTEGER,
  "revisitPolicy" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceOfferingContinuityPolicy_pkey" PRIMARY KEY ("offeringId"),
  CONSTRAINT "ServiceOfferingContinuityPolicy_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceOfferingContinuityPolicy_warrantyDays_check"
    CHECK ("warrantyDays" IS NULL OR ("warrantyDays" >= 1 AND "warrantyDays" <= 3650)),
  CONSTRAINT "ServiceOfferingContinuityPolicy_revisitPolicy_check"
    CHECK ("revisitPolicy" IS NULL OR char_length("revisitPolicy") <= 500)
);
