-- Never delete or silently close historical attendance to install this guard.
-- Existing duplicates require reviewed corrections before this migration.
CREATE UNIQUE INDEX "SocietyWorkerAttendance_one_open_per_worker"
ON "SocietyWorkerAttendance" ("societyId", "workerId")
WHERE "checkedOutAt" IS NULL;
