ALTER TABLE "SosIncident"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'HIGH';

ALTER TABLE "SosIncident"
  ADD CONSTRAINT "SosIncident_category_check"
  CHECK ("category" IN ('MEDICAL', 'FIRE', 'SECURITY', 'LIFT', 'OTHER')),
  ADD CONSTRAINT "SosIncident_severity_check"
  CHECK ("severity" IN ('CRITICAL', 'HIGH', 'MEDIUM'));

CREATE INDEX "SosIncident_society_status_severity_created_idx"
  ON "SosIncident" ("societyId", "status", "severity", "createdAt" DESC);
