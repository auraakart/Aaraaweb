BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerAndroidRunnerEvidenceAcceptance" (
 "id" UUID NOT NULL,
 "challengeId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "workerId" VARCHAR(64) NOT NULL,
 "runId" VARCHAR(64) NOT NULL,
 "nonceDigest" VARCHAR(64) NOT NULL,
 "imageDigest" VARCHAR(71) NOT NULL,
 "manifestDigest" VARCHAR(64) NOT NULL,
 "sourceSha" VARCHAR(40) NOT NULL,
 "lockDigest" VARCHAR(64) NOT NULL,
 "nativeInventoryDigest" VARCHAR(64) NOT NULL,
 "toolchainReceiptDigest" VARCHAR(64) NOT NULL,
 "signatureDigest" VARCHAR(64) NOT NULL,
 "versionCode" INTEGER NOT NULL,
 "issuedAt" TIMESTAMPTZ(6) NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidRunnerEvidenceAcceptance_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidRunnerAcceptance_worker_shape" CHECK ("workerId" ~ '^TEST_WORKER_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidRunnerAcceptance_run_shape" CHECK ("runId" ~ '^TEST_RUN_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidRunnerAcceptance_sha_shapes" CHECK (
  "nonceDigest" ~ '^[0-9a-f]{64}$' AND "manifestDigest" ~ '^[0-9a-f]{64}$'
  AND "sourceSha" ~ '^[0-9a-f]{40}$' AND "lockDigest" ~ '^[0-9a-f]{64}$'
  AND "nativeInventoryDigest" ~ '^[0-9a-f]{64}$'
  AND "toolchainReceiptDigest" ~ '^[0-9a-f]{64}$' AND "signatureDigest" ~ '^[0-9a-f]{64}$'
  AND "imageDigest" ~ '^sha256:[0-9a-f]{64}$'),
 CONSTRAINT "AndroidRunnerAcceptance_version_range" CHECK ("versionCode" BETWEEN 1 AND 2100000000),
 CONSTRAINT "AndroidRunnerAcceptance_lifetime" CHECK (
  "expiresAt">"issuedAt" AND "expiresAt"<="issuedAt"+INTERVAL '90 seconds')
);
CREATE UNIQUE INDEX "PartnerAndroidRunnerEvidenceAcceptance_challengeId_key"
 ON "PartnerAndroidRunnerEvidenceAcceptance"("challengeId");
CREATE UNIQUE INDEX "PartnerAndroidRunnerEvidenceAcceptance_runId_key"
 ON "PartnerAndroidRunnerEvidenceAcceptance"("runId");
CREATE UNIQUE INDEX "PartnerAndroidRunnerEvidenceAcceptance_nonceDigest_key"
 ON "PartnerAndroidRunnerEvidenceAcceptance"("nonceDigest");
CREATE UNIQUE INDEX "PartnerAndroidRunnerEvidenceAcceptance_signatureDigest_key"
 ON "PartnerAndroidRunnerEvidenceAcceptance"("signatureDigest");
CREATE INDEX "PartnerAndroidRunnerEvidenceAcceptance_workerId_createdAt_idx"
 ON "PartnerAndroidRunnerEvidenceAcceptance"("workerId","createdAt");
ALTER TABLE "PartnerAndroidRunnerEvidenceAcceptance" ADD CONSTRAINT "PartnerAndroidRunnerEvidenceAcceptance_challengeId_fkey"
 FOREIGN KEY ("challengeId") REFERENCES "PartnerAndroidRunnerChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidRunnerEvidenceAcceptance" ADD CONSTRAINT "PartnerAndroidRunnerEvidenceAcceptance_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION aaraagate_v5515_runner_acceptance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE challenge "PartnerAndroidRunnerChallenge"%ROWTYPE;
 used "PartnerAndroidBuildWorkerConsumption"%ROWTYPE;
 claim "PartnerAndroidBuildWorkerClaim"%ROWTYPE;
 receipt "PartnerAndroidBuildReservation"%ROWTYPE;
 revision "PartnerAndroidBuildRevision"%ROWTYPE;
 proposal "PartnerDistributionProposal"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT challenge FROM "PartnerAndroidRunnerChallenge"
  WHERE "id"=NEW."challengeId" FOR SHARE;
 SELECT * INTO STRICT used FROM "PartnerAndroidBuildWorkerConsumption"
  WHERE "id"=challenge."consumptionId" FOR SHARE;
 SELECT * INTO STRICT claim FROM "PartnerAndroidBuildWorkerClaim"
  WHERE "id"=used."claimId" FOR SHARE;
 SELECT * INTO STRICT receipt FROM "PartnerAndroidBuildReservation"
  WHERE "id"=claim."reservationId" FOR SHARE;
 SELECT * INTO STRICT revision FROM "PartnerAndroidBuildRevision"
  WHERE "id"=receipt."revisionId" FOR SHARE;
 SELECT * INTO STRICT proposal FROM "PartnerDistributionProposal"
  WHERE "id"=receipt."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(proposal."allocationId",NEW."actorId");
 IF challenge."actorId"<>NEW."actorId" OR used."actorId"<>NEW."actorId"
  OR claim."actorId"<>NEW."actorId"
  OR challenge."workerId"<>NEW."workerId" OR used."workerId"<>NEW."workerId"
  OR claim."workerId"<>NEW."workerId"
  OR challenge."runId"<>NEW."runId" OR challenge."nonceDigest"<>NEW."nonceDigest"
  OR challenge."imageDigest"<>NEW."imageDigest"
  OR challenge."manifestDigest"<>NEW."manifestDigest"
  OR used."manifestDigest"<>NEW."manifestDigest"
  OR revision."digest"<>NEW."manifestDigest" OR receipt."digest"<>NEW."manifestDigest"
  OR challenge."versionCode"<>NEW."versionCode"
  OR used."versionCode"<>NEW."versionCode" OR receipt."versionCode"<>NEW."versionCode"
  OR used."sourceSha"<>NEW."sourceSha" OR used."lockDigest"<>NEW."lockDigest"
  OR (revision."manifest"->>'buildMode') IS DISTINCT FROM 'TEST'
  OR (revision."manifest"->>'sourceSha') IS DISTINCT FROM NEW."sourceSha"
  OR (revision."manifest"->>'lockDigest') IS DISTINCT FROM NEW."lockDigest"
  OR NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" a WHERE a."proposalId"=proposal."id"
    AND NOT EXISTS (SELECT 1 FROM "PartnerDistributionRevocation" revoked WHERE revoked."approvalId"=a."id"))
  OR NOT EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" a WHERE a."revisionId"=revision."id")
  OR EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevision" newer
     WHERE newer."proposalId"=proposal."id" AND newer."version">revision."version")
  OR claim."expiresAt"<=CURRENT_TIMESTAMP OR challenge."expiresAt"<=CURRENT_TIMESTAMP
 THEN RAISE EXCEPTION 'Current consumed TEST runner challenge and approval required' USING ERRCODE='23514'; END IF;
 IF NEW."issuedAt"<challenge."issuedAt"-INTERVAL '5 seconds'
  OR NEW."issuedAt">CURRENT_TIMESTAMP+INTERVAL '5 seconds'
  OR NEW."issuedAt"<CURRENT_TIMESTAMP-INTERVAL '30 seconds'
  OR NEW."expiresAt">challenge."expiresAt"
  OR NEW."expiresAt"<=CURRENT_TIMESTAMP
 THEN RAISE EXCEPTION 'Expired or foreign TEST runner signed evidence window' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_runner_acceptance_valid"
 BEFORE INSERT ON "PartnerAndroidRunnerEvidenceAcceptance" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_v5515_runner_acceptance_guard();
CREATE TRIGGER "android_runner_acceptance_immutable"
 BEFORE UPDATE OR DELETE ON "PartnerAndroidRunnerEvidenceAcceptance" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
