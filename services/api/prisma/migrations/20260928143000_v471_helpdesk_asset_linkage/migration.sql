ALTER TABLE "HelpdeskTicket" ADD COLUMN "assetId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "FacilityAsset_society_id_key"
  ON "FacilityAsset"("societyId","id");

ALTER TABLE "HelpdeskTicket"
  ADD CONSTRAINT "HelpdeskTicket_society_asset_fkey"
  FOREIGN KEY ("societyId","assetId")
  REFERENCES "FacilityAsset"("societyId","id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "HelpdeskTicket_society_asset_created_idx"
  ON "HelpdeskTicket"("societyId","assetId","createdAt" DESC);
