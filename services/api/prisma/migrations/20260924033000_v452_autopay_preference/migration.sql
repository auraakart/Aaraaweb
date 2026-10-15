CREATE TABLE "PaymentAutopayPreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "payerUserId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "maxAmountPaise" INTEGER,
  "debitDaysBefore" INTEGER NOT NULL DEFAULT 1,
  "provider" TEXT,
  "providerMandateId" TEXT,
  "providerMandateStatus" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAutopayPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAutopayPreference_max_amount_check" CHECK ("maxAmountPaise" IS NULL OR "maxAmountPaise" >= 100),
  CONSTRAINT "PaymentAutopayPreference_debit_days_check" CHECK ("debitDaysBefore" BETWEEN 0 AND 10),
  CONSTRAINT "PaymentAutopayPreference_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "PaymentAutopayPreference_unit_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE,
  CONSTRAINT "PaymentAutopayPreference_payer_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PaymentAutopayPreference_society_unit_payer_key" ON "PaymentAutopayPreference"("societyId","unitId","payerUserId");
CREATE INDEX "PaymentAutopayPreference_society_unit_enabled_idx" ON "PaymentAutopayPreference"("societyId","unitId","enabled");
