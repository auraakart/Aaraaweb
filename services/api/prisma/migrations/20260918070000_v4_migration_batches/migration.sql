CREATE TABLE "MigrationBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "sourceLabel" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
  "checksum" VARCHAR(64) NOT NULL,
  "totalRows" INTEGER NOT NULL,
  "validRows" INTEGER NOT NULL,
  "invalidRows" INTEGER NOT NULL,
  "duplicateRows" INTEGER NOT NULL,
  "referentialIssueCount" INTEGER NOT NULL DEFAULT 0,
  "issues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationBatch_entityType_check" CHECK ("entityType" IN ('BUILDING','UNIT','RESIDENT','VEHICLE','PARKING','WORKFORCE','VENDOR','OPENING_BALANCE')),
  CONSTRAINT "MigrationBatch_status_check" CHECK ("status" IN ('PREVIEWED','READY','COMMITTED','ROLLED_BACK','FAILED')),
  CONSTRAINT "MigrationBatch_counts_check" CHECK ("totalRows" >= 0 AND "validRows" >= 0 AND "invalidRows" >= 0 AND "duplicateRows" >= 0 AND "referentialIssueCount" >= 0)
);

CREATE UNIQUE INDEX "MigrationBatch_society_checksum_key" ON "MigrationBatch" ("societyId","checksum");
CREATE INDEX "MigrationBatch_society_created_idx" ON "MigrationBatch" ("societyId","createdAt" DESC);
CREATE INDEX "MigrationBatch_society_status_idx" ON "MigrationBatch" ("societyId","status","createdAt" DESC);

CREATE TABLE "MigrationBatchRow" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batchId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "normalized" JSONB NOT NULL,
  "identityKey" TEXT,
  "valid" BOOLEAN NOT NULL,
  "issues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationBatchRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationBatchRow_rowNumber_check" CHECK ("rowNumber" > 0)
);

CREATE UNIQUE INDEX "MigrationBatchRow_batch_row_key" ON "MigrationBatchRow" ("batchId","rowNumber");
CREATE INDEX "MigrationBatchRow_batch_valid_idx" ON "MigrationBatchRow" ("batchId","valid","rowNumber");

ALTER TABLE "MigrationBatch"
  ADD CONSTRAINT "MigrationBatch_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MigrationBatch_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationBatchRow"
  ADD CONSTRAINT "MigrationBatchRow_batch_fkey" FOREIGN KEY ("batchId") REFERENCES "MigrationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
