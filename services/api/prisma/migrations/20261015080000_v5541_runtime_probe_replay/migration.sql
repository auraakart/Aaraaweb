BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerAndroidRunnerRuntimeProbe" (
 "id" UUID NOT NULL,
 "acceptanceId" UUID NOT NULL,
 "challengeId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "workerId" VARCHAR(64) NOT NULL,
 "runId" VARCHAR(64) NOT NULL,
 "imageDigest" VARCHAR(71) NOT NULL,
 "sourceSha" VARCHAR(40) NOT NULL,
 "manifestDigest" VARCHAR(64) NOT NULL,
 "transportNonceDigest" VARCHAR(64) NOT NULL,
 "runtimeEnvelopeDigest" VARCHAR(64) NOT NULL,
 "transportSignatureDigest" VARCHAR(64) NOT NULL,
 "serverSpkiSha256" VARCHAR(64) NOT NULL,
 "verifiedAt" TIMESTAMPTZ(6) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidRunnerRuntimeProbe_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidRuntimeProbe_worker_shape" CHECK ("workerId" ~ '^TEST_WORKER_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidRuntimeProbe_run_shape" CHECK ("runId" ~ '^TEST_RUN_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidRuntimeProbe_sha_shapes" CHECK (
  "imageDigest" ~ '^sha256:[0-9a-f]{64}$'
  AND "sourceSha" ~ '^[0-9a-f]{40}$'
  AND "manifestDigest" ~ '^[0-9a-f]{64}$'
  AND "transportNonceDigest" ~ '^[0-9a-f]{64}$'
  AND "runtimeEnvelopeDigest" ~ '^[0-9a-f]{64}$'
  AND "transportSignatureDigest" ~ '^[0-9a-f]{64}$'
  AND "serverSpkiSha256" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "AndroidRuntimeProbe_acceptanceId_key" ON "PartnerAndroidRunnerRuntimeProbe"("acceptanceId");
CREATE UNIQUE INDEX "AndroidRuntimeProbe_challengeId_key" ON "PartnerAndroidRunnerRuntimeProbe"("challengeId");
CREATE UNIQUE INDEX "AndroidRuntimeProbe_runId_key" ON "PartnerAndroidRunnerRuntimeProbe"("runId");
CREATE UNIQUE INDEX "AndroidRuntimeProbe_transportNonceDigest_key" ON "PartnerAndroidRunnerRuntimeProbe"("transportNonceDigest");
CREATE UNIQUE INDEX "AndroidRuntimeProbe_runtimeEnvelopeDigest_key" ON "PartnerAndroidRunnerRuntimeProbe"("runtimeEnvelopeDigest");
CREATE UNIQUE INDEX "AndroidRuntimeProbe_transportSignatureDigest_key" ON "PartnerAndroidRunnerRuntimeProbe"("transportSignatureDigest");
CREATE INDEX "AndroidRuntimeProbe_workerId_createdAt_idx" ON "PartnerAndroidRunnerRuntimeProbe"("workerId","createdAt");
ALTER TABLE "PartnerAndroidRunnerRuntimeProbe" ADD CONSTRAINT "AndroidRuntimeProbe_acceptanceId_fkey"
 FOREIGN KEY ("acceptanceId") REFERENCES "PartnerAndroidRunnerEvidenceAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidRunnerRuntimeProbe" ADD CONSTRAINT "AndroidRuntimeProbe_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION aaraagate_v5541_runtime_probe_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE accepted "PartnerAndroidRunnerEvidenceAcceptance"%ROWTYPE;
 challenge "PartnerAndroidRunnerChallenge"%ROWTYPE;
 used "PartnerAndroidBuildWorkerConsumption"%ROWTYPE;
 claim "PartnerAndroidBuildWorkerClaim"%ROWTYPE;
 reservation "PartnerAndroidBuildReservation"%ROWTYPE;
 revision "PartnerAndroidBuildRevision"%ROWTYPE;
 proposal "PartnerDistributionProposal"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT accepted FROM "PartnerAndroidRunnerEvidenceAcceptance"
  WHERE "id"=NEW."acceptanceId" FOR SHARE;
 SELECT * INTO STRICT challenge FROM "PartnerAndroidRunnerChallenge"
  WHERE "id"=accepted."challengeId" FOR SHARE;
 SELECT * INTO STRICT used FROM "PartnerAndroidBuildWorkerConsumption"
  WHERE "id"=challenge."consumptionId" FOR SHARE;
 SELECT * INTO STRICT claim FROM "PartnerAndroidBuildWorkerClaim"
  WHERE "id"=used."claimId" FOR SHARE;
 SELECT * INTO STRICT reservation FROM "PartnerAndroidBuildReservation"
  WHERE "id"=claim."reservationId" FOR SHARE;
 SELECT * INTO STRICT revision FROM "PartnerAndroidBuildRevision"
  WHERE "id"=reservation."revisionId" FOR SHARE;
 SELECT * INTO STRICT proposal FROM "PartnerDistributionProposal"
  WHERE "id"=reservation."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(proposal."allocationId",NEW."actorId");
 IF accepted."challengeId"<>NEW."challengeId"
  OR challenge."id"<>NEW."challengeId"
  OR accepted."actorId"<>NEW."actorId"
  OR challenge."actorId"<>NEW."actorId"
  OR used."actorId"<>NEW."actorId"
  OR claim."actorId"<>NEW."actorId"
  OR accepted."workerId"<>NEW."workerId"
  OR challenge."workerId"<>NEW."workerId"
  OR used."workerId"<>NEW."workerId"
  OR claim."workerId"<>NEW."workerId"
  OR accepted."runId"<>NEW."runId"
  OR challenge."runId"<>NEW."runId"
  OR accepted."imageDigest"<>NEW."imageDigest"
  OR challenge."imageDigest"<>NEW."imageDigest"
  OR accepted."manifestDigest"<>NEW."manifestDigest"
  OR challenge."manifestDigest"<>NEW."manifestDigest"
  OR revision."digest"<>NEW."manifestDigest"
  OR reservation."digest"<>NEW."manifestDigest"
  OR accepted."sourceSha"<>NEW."sourceSha"
  OR used."sourceSha"<>NEW."sourceSha"
  OR accepted."expiresAt"<=CURRENT_TIMESTAMP
  OR challenge."expiresAt"<=CURRENT_TIMESTAMP
  OR claim."expiresAt"<=CURRENT_TIMESTAMP
  OR (revision."manifest"->>'buildMode') IS DISTINCT FROM 'TEST'
  OR (revision."manifest"->>'sourceSha') IS DISTINCT FROM NEW."sourceSha"
  OR (revision."manifest"->>'lockDigest') IS DISTINCT FROM used."lockDigest"
  OR NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" approved
   WHERE approved."proposalId"=proposal."id"
   AND NOT EXISTS (SELECT 1 FROM "PartnerDistributionRevocation" revoked
    WHERE revoked."approvalId"=approved."id"))
  OR NOT EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" approved
   WHERE approved."revisionId"=revision."id")
  OR EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevision" newer
   WHERE newer."proposalId"=proposal."id" AND newer."version">revision."version")
 THEN RAISE EXCEPTION 'Runtime TEST probe scope or approval changed'
  USING ERRCODE='23514'; END IF;
 IF NEW."verifiedAt"<CURRENT_TIMESTAMP-INTERVAL '30 seconds'
  OR NEW."verifiedAt">CURRENT_TIMESTAMP+INTERVAL '5 seconds'
  OR NEW."verifiedAt">accepted."expiresAt"
  OR NEW."verifiedAt">challenge."expiresAt"
 THEN RAISE EXCEPTION 'Runtime TEST probe stale or expired'
  USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_runtime_probe_guard"
 BEFORE INSERT ON "PartnerAndroidRunnerRuntimeProbe" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_v5541_runtime_probe_guard();
CREATE TRIGGER "android_runtime_probe_immutable"
 BEFORE UPDATE OR DELETE ON "PartnerAndroidRunnerRuntimeProbe" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
