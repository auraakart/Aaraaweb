CREATE TABLE "MigrationBatchArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rowId" UUID NOT NULL,
  "artifactType" VARCHAR(64) NOT NULL,
  "artifactId" UUID NOT NULL,
  "createdByMigration" BOOLEAN NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rolledBackAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationBatchArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationBatchArtifact_row_fkey" FOREIGN KEY ("rowId") REFERENCES "MigrationBatchRow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MigrationBatchArtifact_type_check" CHECK ("artifactType" IN ('USER','SOCIETY_MEMBERSHIP','UNIT_OWNERSHIP','UNIT_OCCUPANCY','HOUSEHOLD'))
);

CREATE UNIQUE INDEX "MigrationBatchArtifact_row_type_target_key"
  ON "MigrationBatchArtifact" ("rowId","artifactType","artifactId");
CREATE INDEX "MigrationBatchArtifact_target_idx"
  ON "MigrationBatchArtifact" ("artifactType","artifactId");
CREATE INDEX "MigrationBatchArtifact_row_created_idx"
  ON "MigrationBatchArtifact" ("rowId","createdByMigration");
