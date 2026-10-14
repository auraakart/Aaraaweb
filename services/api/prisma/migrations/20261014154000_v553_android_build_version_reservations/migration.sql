BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerAndroidBuildReservation" (
 "id" UUID NOT NULL,
 "proposalId" UUID NOT NULL,
 "revisionId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "idempotencyKey" UUID NOT NULL,
 "versionCode" INTEGER NOT NULL,
 "digest" VARCHAR(64) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidBuildReservation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidBuildReservation_version_range" CHECK ("versionCode" BETWEEN 1 AND 2100000000),
 CONSTRAINT "AndroidBuildReservation_digest_shape" CHECK ("digest" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "PartnerAndroidBuildReservation_proposalId_versionCode_key"
 ON "PartnerAndroidBuildReservation"("proposalId","versionCode");
CREATE UNIQUE INDEX "PartnerAndroidBuildReservation_proposalId_idempotencyKey_key"
 ON "PartnerAndroidBuildReservation"("proposalId","idempotencyKey");
CREATE INDEX "PartnerAndroidBuildReservation_revisionId_createdAt_idx"
 ON "PartnerAndroidBuildReservation"("revisionId","createdAt");
ALTER TABLE "PartnerAndroidBuildReservation" ADD CONSTRAINT "PartnerAndroidBuildReservation_proposalId_fkey"
 FOREIGN KEY ("proposalId") REFERENCES "PartnerDistributionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildReservation" ADD CONSTRAINT "PartnerAndroidBuildReservation_revisionId_fkey"
 FOREIGN KEY ("revisionId") REFERENCES "PartnerAndroidBuildRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildReservation" ADD CONSTRAINT "PartnerAndroidBuildReservation_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION aaraagate_v553_reserve_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE p "PartnerDistributionProposal"%ROWTYPE; r "PartnerAndroidBuildRevision"%ROWTYPE;
 prior_version INTEGER; current_society UUID; current_partner UUID;
BEGIN
 -- Exact proposal lock shared by the API: different request keys cannot
 -- allocate the same version even when submitted concurrently.
 SELECT * INTO STRICT p FROM "PartnerDistributionProposal" WHERE "id"=NEW."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(p."allocationId",NEW."actorId");
 SELECT l."societyId",s."partnerId" INTO STRICT current_society,current_partner
 FROM "SocietyLicenseAllocation" l JOIN "Society" s ON s."id"=l."societyId" WHERE l."id"=p."allocationId";
 IF NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" a
    WHERE a."proposalId"=p."id" AND NOT EXISTS (
      SELECT 1 FROM "PartnerDistributionRevocation" revoked WHERE revoked."approvalId"=a."id"))
 THEN RAISE EXCEPTION 'Current approved distribution required' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT r FROM "PartnerAndroidBuildRevision" WHERE "id"=NEW."revisionId";
 IF r."proposalId"<>p."id" OR r."digest"<>NEW."digest"
   OR NOT EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" a WHERE a."revisionId"=r."id")
   OR EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevision" newer
      WHERE newer."proposalId"=p."id" AND newer."version">r."version")
   OR (r."manifest"->>'buildMode') IS DISTINCT FROM 'TEST'
   OR (r."manifest"->>'societyId') IS DISTINCT FROM current_society::text
   OR (r."manifest"->>'partnerId') IS DISTINCT FROM current_partner::text
   OR (r."manifest"->>'applicationId') IS DISTINCT FROM p."applicationId"
 THEN RAISE EXCEPTION 'Latest reviewed TEST identity required' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(MAX("versionCode"),0) INTO prior_version FROM "PartnerAndroidBuildReservation"
 WHERE "proposalId"=p."id";
 IF prior_version>=2100000000 OR NEW."versionCode"<>prior_version+1
 THEN RAISE EXCEPTION 'Android versionCode cannot be reused or skipped' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_version_reservation_valid"
 BEFORE INSERT ON "PartnerAndroidBuildReservation" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_v553_reserve_version();
CREATE TRIGGER "android_version_reservation_immutable"
 BEFORE UPDATE OR DELETE ON "PartnerAndroidBuildReservation" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
