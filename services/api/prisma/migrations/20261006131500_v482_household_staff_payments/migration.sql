CREATE TABLE "WorkforcePaymentRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "assignmentId" UUID NOT NULL,
  "recordedById" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "paymentDate" DATE NOT NULL,
  "periodMonth" TEXT,
  "note" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkforcePaymentRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkforcePaymentRecord_amount_check" CHECK ("amountPaise" > 0),
  CONSTRAINT "WorkforcePaymentRecord_kind_check" CHECK ("kind" IN ('SALARY','ADVANCE','BONUS','REIMBURSEMENT','ADJUSTMENT')),
  CONSTRAINT "WorkforcePaymentRecord_society_fk" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "WorkforcePaymentRecord_assignment_fk" FOREIGN KEY ("assignmentId") REFERENCES "WorkforceAssignment"("id") ON DELETE CASCADE,
  CONSTRAINT "WorkforcePaymentRecord_recorder_fk" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "WorkforcePaymentRecord_society_recorder_idempotency_key"
  ON "WorkforcePaymentRecord"("societyId","recordedById","idempotencyKey");
CREATE INDEX "WorkforcePaymentRecord_society_assignment_date_idx"
  ON "WorkforcePaymentRecord"("societyId","assignmentId","paymentDate" DESC);
CREATE INDEX "WorkforcePaymentRecord_society_recorder_created_idx"
  ON "WorkforcePaymentRecord"("societyId","recordedById","createdAt" DESC);
