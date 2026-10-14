BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE "PartnerAndroidBuildRevision" (
 "id" UUID NOT NULL, "proposalId" UUID NOT NULL, "version" INTEGER NOT NULL,
 "manifest" JSONB NOT NULL, "digest" VARCHAR(64) NOT NULL,
 "actorId" UUID NOT NULL, "idempotencyKey" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidBuildRevision_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidBuildRevision_version_positive" CHECK ("version" BETWEEN 1 AND 2147483647),
 CONSTRAINT "AndroidBuildRevision_manifest_shape" CHECK (
  jsonb_typeof("manifest")='object'
  AND "manifest" ?& ARRAY['schemaVersion','distributionId','approvalId','partnerId','societyId',
   'brandRevision','sourceSha','lockDigest','applicationId','namespace','appRole','label','buildMode',
   'apiOrigin','configDigest','assetDigests','firebaseClientRef','appLinkHosts','signingProfile','signerFingerprint']
  AND "manifest" - ARRAY['schemaVersion','distributionId','approvalId','partnerId','societyId',
   'brandRevision','sourceSha','lockDigest','applicationId','namespace','appRole','label','buildMode',
   'apiOrigin','configDigest','assetDigests','firebaseClientRef','appLinkHosts','signingProfile','signerFingerprint']='{}'::jsonb
  AND "manifest"->'schemaVersion'='1'::jsonb AND "manifest"->>'buildMode'='TEST'
  AND "manifest"->>'appRole' IN ('RESIDENT','GUARD')
  AND "manifest"->>'sourceSha' ~ '^[0-9a-f]{40}$'
  AND "manifest"->>'lockDigest' ~ '^[0-9a-f]{64}$'
  AND "manifest"->>'configDigest' ~ '^[0-9a-f]{64}$'
  AND "manifest"->>'signerFingerprint' ~ '^[0-9a-f]{64}$'
  AND "manifest"->>'applicationId'="manifest"->>'namespace'
  AND "manifest"->>'signingProfile' ~ '^TEST_[A-Z0-9_]{3,60}$'
  AND "digest" ~ '^[0-9a-f]{64}$'
 )
);
CREATE TABLE "PartnerAndroidBuildRevisionApproval" (
 "id" UUID NOT NULL, "revisionId" UUID NOT NULL UNIQUE,
 "actorId" UUID NOT NULL, "idempotencyKey" UUID NOT NULL,
 "reason" VARCHAR(500) NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidBuildRevisionApproval_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidBuildRevisionReview_reason" CHECK (length(btrim("reason")) BETWEEN 3 AND 500)
);
CREATE UNIQUE INDEX "PartnerAndroidBuildRevision_proposalId_version_key" ON "PartnerAndroidBuildRevision"("proposalId","version");
CREATE UNIQUE INDEX "PartnerAndroidBuildRevision_proposalId_idempotencyKey_key" ON "PartnerAndroidBuildRevision"("proposalId","idempotencyKey");
ALTER TABLE "PartnerAndroidBuildRevision" ADD CONSTRAINT "PartnerAndroidBuildRevision_proposalId_fkey"
 FOREIGN KEY ("proposalId") REFERENCES "PartnerDistributionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildRevision" ADD CONSTRAINT "PartnerAndroidBuildRevision_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildRevisionApproval" ADD CONSTRAINT "PartnerAndroidBuildRevisionApproval_revisionId_fkey"
 FOREIGN KEY ("revisionId") REFERENCES "PartnerAndroidBuildRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildRevisionApproval" ADD CONSTRAINT "PartnerAndroidBuildRevisionApproval_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION aaraagate_v552_revision_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE p "PartnerDistributionProposal"%ROWTYPE; a "PartnerDistributionApproval"%ROWTYPE;
 latest_version INTEGER; latest_manifest JSONB;
BEGIN
 SELECT * INTO STRICT p FROM "PartnerDistributionProposal" WHERE "id"=NEW."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(p."allocationId",NEW."actorId");
 SELECT * INTO STRICT a FROM "PartnerDistributionApproval" WHERE "proposalId"=p."id";
 IF EXISTS (SELECT 1 FROM "PartnerDistributionRevocation" WHERE "approvalId"=a."id") THEN
  RAISE EXCEPTION 'Revoked distribution cannot gain build revisions' USING ERRCODE='23514';
 END IF;
 IF NEW."manifest"->>'distributionId'<>p."id"::text
  OR NEW."manifest"->>'approvalId'<>a."id"::text
  OR NEW."manifest"->>'applicationId'<>p."applicationId"
  OR NEW."manifest"->>'appRole'<>p."manifest"->>'appRole'
  OR NEW."manifest"->>'signingProfile'<>p."manifest"->>'signingProfile' THEN
  RAISE EXCEPTION 'Android distribution identity changed' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(MAX("version"),0) INTO latest_version FROM "PartnerAndroidBuildRevision"
  WHERE "proposalId"=p."id";
 IF NEW."version"<>latest_version+1 THEN
  RAISE EXCEPTION 'Build revision version must increase atomically' USING ERRCODE='23514';
 END IF;
 SELECT r."manifest" INTO latest_manifest FROM "PartnerAndroidBuildRevision" r
  WHERE r."proposalId"=p."id" ORDER BY r."version" DESC LIMIT 1;
 IF latest_manifest IS NOT NULL AND latest_manifest->>'signerFingerprint'<>NEW."manifest"->>'signerFingerprint' THEN
  RAISE EXCEPTION 'Android signer continuity required' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "PartnerAndroidBuildRevision" r
  WHERE r."proposalId"=p."id" AND NOT EXISTS(
   SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" v WHERE v."revisionId"=r."id")) THEN
  RAISE EXCEPTION 'Prior revision has no independent approval' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_revision_insert_valid" BEFORE INSERT ON "PartnerAndroidBuildRevision"
 FOR EACH ROW EXECUTE FUNCTION aaraagate_v552_revision_insert();

CREATE FUNCTION aaraagate_v552_revision_review() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r "PartnerAndroidBuildRevision"%ROWTYPE; p "PartnerDistributionProposal"%ROWTYPE; maker UUID;
BEGIN
 SELECT * INTO STRICT r FROM "PartnerAndroidBuildRevision" WHERE "id"=NEW."revisionId";
 SELECT * INTO STRICT p FROM "PartnerDistributionProposal" WHERE "id"=r."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(p."allocationId",NEW."actorId");
 IF EXISTS (SELECT 1 FROM "PartnerDistributionApproval" a JOIN "PartnerDistributionRevocation" revoked
  ON revoked."approvalId"=a."id" WHERE a."proposalId"=p."id") THEN
  RAISE EXCEPTION 'Distribution approval withdrawn' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" WHERE "proposalId"=p."id") THEN
  RAISE EXCEPTION 'Distribution not approved' USING ERRCODE='23514';
 END IF;
 IF NEW."actorId"=r."actorId" THEN
  RAISE EXCEPTION 'Independent build revision review required' USING ERRCODE='23514';
 END IF;
 PERFORM aaraagate_v5454_operator(r."actorId",(SELECT "societyId" FROM "SocietyLicenseAllocation" WHERE "id"=p."allocationId"),false);
 IF EXISTS(SELECT 1 FROM "PartnerAndroidBuildRevision" later
  WHERE later."proposalId"=p."id" AND later."version">r."version") THEN
  RAISE EXCEPTION 'Superseded revision cannot be reviewed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_revision_review_valid" BEFORE INSERT ON "PartnerAndroidBuildRevisionApproval"
 FOR EACH ROW EXECUTE FUNCTION aaraagate_v552_revision_review();
CREATE TRIGGER "android_revision_append_only" BEFORE UPDATE OR DELETE ON "PartnerAndroidBuildRevision"
 FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "android_revision_approval_append_only" BEFORE UPDATE OR DELETE ON "PartnerAndroidBuildRevisionApproval"
 FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();

COMMIT;
