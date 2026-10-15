CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID');
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

CREATE TABLE "MaintenanceInvoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "societyId" UUID NOT NULL, "unitId" UUID NOT NULL, "createdById" UUID NOT NULL,
  "invoiceNumber" TEXT NOT NULL, "billingPeriod" TEXT NOT NULL, "description" TEXT, "amountPaise" INTEGER NOT NULL,
  "dueDate" DATE NOT NULL, "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED', "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMPTZ(6), "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceInvoice_pkey" PRIMARY KEY ("id"), CONSTRAINT "MaintenanceInvoice_amount_check" CHECK ("amountPaise" > 0)
);
CREATE UNIQUE INDEX "MaintenanceInvoice_societyId_invoiceNumber_key" ON "MaintenanceInvoice"("societyId","invoiceNumber");
CREATE INDEX "MaintenanceInvoice_societyId_unitId_status_dueDate_idx" ON "MaintenanceInvoice"("societyId","unitId","status","dueDate");

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "societyId" UUID NOT NULL, "invoiceId" UUID NOT NULL, "payerUserId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "provider" TEXT NOT NULL, "providerOrderId" TEXT NOT NULL, "providerPaymentId" TEXT,
  "amountPaise" INTEGER NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED', "failureCode" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"), CONSTRAINT "Payment_amount_check" CHECK ("amountPaise" > 0)
);
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");
CREATE UNIQUE INDEX "Payment_societyId_payerUserId_idempotencyKey_key" ON "Payment"("societyId","payerUserId","idempotencyKey");
CREATE INDEX "Payment_societyId_invoiceId_status_idx" ON "Payment"("societyId","invoiceId","status");

CREATE TABLE "PaymentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "societyId" UUID NOT NULL, "paymentId" UUID NOT NULL, "actorUserId" UUID,
  "providerEventId" TEXT, "type" TEXT NOT NULL, "payloadDigest" TEXT, "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX "PaymentEvent_societyId_paymentId_occurredAt_idx" ON "PaymentEvent"("societyId","paymentId","occurredAt");

ALTER TABLE "MaintenanceInvoice" ADD CONSTRAINT "MaintenanceInvoice_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE;
ALTER TABLE "MaintenanceInvoice" ADD CONSTRAINT "MaintenanceInvoice_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT;
ALTER TABLE "MaintenanceInvoice" ADD CONSTRAINT "MaintenanceInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "MaintenanceInvoice"("id") ON DELETE RESTRICT;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
