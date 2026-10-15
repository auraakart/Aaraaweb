CREATE TABLE "ProcurementExpenseLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "expenseId" UUID NOT NULL,
  "linkedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementExpenseLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementExpenseLink_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementExpenseLink_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementExpenseLink_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SocietyExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementExpenseLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementExpenseLink_purchaseOrderId_key" UNIQUE ("purchaseOrderId"),
  CONSTRAINT "ProcurementExpenseLink_expenseId_key" UNIQUE ("expenseId")
);

CREATE INDEX "ProcurementExpenseLink_society_created_idx" ON "ProcurementExpenseLink"("societyId", "createdAt" DESC);
