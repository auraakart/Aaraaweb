-- Strengthen tenant isolation for optional unit dimensions on accounting lines.
-- JournalLine already carries societyId; bind unit references to the same society
-- at the database layer rather than relying only on application authorization.

CREATE UNIQUE INDEX IF NOT EXISTS "Unit_id_society_key" ON "Unit" ("id", "societyId");

ALTER TABLE "JournalLine" DROP CONSTRAINT IF EXISTS "JournalLine_unit_fkey";
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_unit_society_fkey"
  FOREIGN KEY ("unitId", "societyId") REFERENCES "Unit"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
