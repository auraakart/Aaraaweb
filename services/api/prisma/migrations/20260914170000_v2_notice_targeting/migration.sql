ALTER TABLE "Notice"
  ADD COLUMN "targetBuildingId" UUID,
  ADD COLUMN "targetUnitId" UUID;

ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_target_scope_check"
  CHECK (NOT ("targetBuildingId" IS NOT NULL AND "targetUnitId" IS NOT NULL));

ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_targetBuildingId_fkey"
  FOREIGN KEY ("targetBuildingId") REFERENCES "Building"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "Notice_targetUnitId_fkey"
  FOREIGN KEY ("targetUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT;

CREATE INDEX "Notice_society_target_building_idx" ON "Notice"("societyId","targetBuildingId") WHERE "targetBuildingId" IS NOT NULL;
CREATE INDEX "Notice_society_target_unit_idx" ON "Notice"("societyId","targetUnitId") WHERE "targetUnitId" IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_notice_target_society()
RETURNS trigger AS $$
BEGIN
  IF NEW."targetBuildingId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Building" b WHERE b."id"=NEW."targetBuildingId" AND b."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Notice building target must belong to notice society';
  END IF;

  IF NEW."targetUnitId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Unit" u WHERE u."id"=NEW."targetUnitId" AND u."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Notice unit target must belong to notice society';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Notice_target_society_guard"
BEFORE INSERT OR UPDATE OF "societyId","targetBuildingId","targetUnitId" ON "Notice"
FOR EACH ROW EXECUTE FUNCTION validate_notice_target_society();

CREATE OR REPLACE FUNCTION filter_notice_recipient_target()
RETURNS trigger AS $$
DECLARE
  target_building UUID;
  target_unit UUID;
  allowed BOOLEAN := false;
BEGIN
  SELECT n."targetBuildingId", n."targetUnitId"
    INTO target_building, target_unit
  FROM "Notice" n
  WHERE n."id"=NEW."noticeId" AND n."societyId"=NEW."societyId";

  IF target_building IS NULL AND target_unit IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."recipientType"='OWNER' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "UnitOwnership" uo
      JOIN "Unit" u ON u."id"=uo."unitId" AND u."societyId"=uo."societyId"
      WHERE uo."societyId"=NEW."societyId" AND uo."userId"=NEW."userId"
        AND uo."verified"=true AND uo."active"=true
        AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        AND (target_unit IS NULL OR u."id"=target_unit)
        AND (target_building IS NULL OR u."buildingId"=target_building)
    ) INTO allowed;
  ELSIF NEW."recipientType"='OCCUPANT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "UnitOccupancy" ur
      JOIN "Unit" u ON u."id"=ur."unitId" AND u."societyId"=ur."societyId"
      WHERE ur."societyId"=NEW."societyId" AND ur."userId"=NEW."userId"
        AND ur."active"=true
        AND ur."effectiveFrom"<=CURRENT_TIMESTAMP
        AND (ur."effectiveTo" IS NULL OR ur."effectiveTo">CURRENT_TIMESTAMP)
        AND (target_unit IS NULL OR u."id"=target_unit)
        AND (target_building IS NULL OR u."buildingId"=target_building)
    ) INTO allowed;
  END IF;

  IF allowed THEN RETURN NEW; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NoticeRecipient_target_filter"
BEFORE INSERT ON "NoticeRecipient"
FOR EACH ROW EXECUTE FUNCTION filter_notice_recipient_target();

ALTER TABLE "NoticeEvent" DROP CONSTRAINT "NoticeEvent_action_check";
ALTER TABLE "NoticeEvent"
  ADD CONSTRAINT "NoticeEvent_action_check"
  CHECK ("action" IN ('CREATED','PUBLISHED','ARCHIVED','READ','ACKNOWLEDGED','TARGET_UPDATED'));
