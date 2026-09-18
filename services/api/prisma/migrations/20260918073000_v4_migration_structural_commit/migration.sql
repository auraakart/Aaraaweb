ALTER TABLE "MigrationBatch"
  ADD COLUMN "committedAt" TIMESTAMPTZ(6),
  ADD COLUMN "committedByUserId" UUID,
  ADD COLUMN "rolledBackAt" TIMESTAMPTZ(6),
  ADD COLUMN "rolledBackByUserId" UUID;

ALTER TABLE "MigrationBatchRow"
  ADD COLUMN "targetType" TEXT,
  ADD COLUMN "targetId" UUID,
  ADD COLUMN "committedAt" TIMESTAMPTZ(6),
  ADD COLUMN "rolledBackAt" TIMESTAMPTZ(6);

ALTER TABLE "MigrationBatch"
  ADD CONSTRAINT "MigrationBatch_committedBy_fkey" FOREIGN KEY ("committedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MigrationBatch_rolledBackBy_fkey" FOREIGN KEY ("rolledBackByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "MigrationBatchRow_target_idx" ON "MigrationBatchRow" ("targetType","targetId");
