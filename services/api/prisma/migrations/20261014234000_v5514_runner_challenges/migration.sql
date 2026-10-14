BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerAndroidRunnerChallenge" (
 "id" UUID NOT NULL,
 "consumptionId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "workerId" VARCHAR(64) NOT NULL,
 "runId" VARCHAR(64) NOT NULL,
 "nonceDigest" VARCHAR(64) NOT NULL,
 "imageDigest" VARCHAR(71) NOT NULL,
 "manifestDigest" VARCHAR(64) NOT NULL,
 "versionCode" INTEGER NOT NULL,
 "issuedAt" TIMESTAMPTZ(6) NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidRunnerChallenge_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidRunnerChallenge_worker_shape"
 CHECK ("workerId" ~ '^TEST_WORKER_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidRunnerChallenge_run_shape"
 CHECK ("runId" ~ '^TEST_RUN_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidRunnerChallenge_digests"
 CHECK ("nonceDigest" ~ '^[0-9a-f]{64}$' AND
  "manifestDigest" ~ '^[0-9a-f]{64}$' AND
  "imageDigest" ~ '^sha256:[0-9a-f]{64}$'),
 CONSTRAINT "AndroidRunnerChallenge_version" CHECK ("versionCode" BETWEEN 1 AND 2100000000),
 CONSTRAINT "AndroidRunnerChallenge_lifetime"
 CHECK ("expiresAt">"issuedAt" AND "expiresAt"<="issuedAt"+INTERVAL '90 seconds')
);
CREATE UNIQUE INDEX "PartnerAndroidRunnerChallenge_consumptionId_key" ON "PartnerAndroidRunnerChallenge"("consumptionId");
CREATE UNIQUE INDEX "PartnerAndroidRunnerChallenge_runId_key" ON "PartnerAndroidRunnerChallenge"("runId");
CREATE UNIQUE INDEX "PartnerAndroidRunnerChallenge_nonceDigest_key" ON "PartnerAndroidRunnerChallenge"("nonceDigest");
CREATE INDEX "PartnerAndroidRunnerChallenge_workerId_createdAt_idx" ON "PartnerAndroidRunnerChallenge"("workerId","createdAt");
ALTER TABLE "PartnerAndroidRunnerChallenge" ADD CONSTRAINT "PartnerAndroidRunnerChallenge_consumptionId_fkey"
 FOREIGN KEY ("consumptionId") REFERENCES "PartnerAndroidBuildWorkerConsumption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidRunnerChallenge" ADD CONSTRAINT "PartnerAndroidRunnerChallenge_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION aaraagate_v5514_runner_challenge_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE used "PartnerAndroidBuildWorkerConsumption"%ROWTYPE;
 claim "PartnerAndroidBuildWorkerClaim"%ROWTYPE;
 receipt "PartnerAndroidBuildReservation"%ROWTYPE;
 revision "PartnerAndroidBuildRevision"%ROWTYPE;
 proposal "PartnerDistributionProposal"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT used FROM "PartnerAndroidBuildWorkerConsumption" WHERE "id"=NEW."consumptionId" FOR SHARE;
 SELECT * INTO STRICT claim FROM "PartnerAndroidBuildWorkerClaim" WHERE "id"=used."claimId" FOR SHARE;
 SELECT * INTO STRICT receipt FROM "PartnerAndroidBuildReservation" WHERE "id"=claim."reservationId" FOR SHARE;
 SELECT * INTO STRICT revision FROM "PartnerAndroidBuildRevision" WHERE "id"=receipt."revisionId" FOR SHARE;
 SELECT * INTO STRICT proposal FROM "PartnerDistributionProposal" WHERE "id"=receipt."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(proposal."allocationId",NEW."actorId");
 IF used."actorId"<>NEW."actorId" OR claim."actorId"<>NEW."actorId"
 OR used."workerId"<>NEW."workerId" OR claim."workerId"<>NEW."workerId"
 OR used."manifestDigest"<>NEW."manifestDigest"
 OR receipt."digest"<>NEW."manifestDigest" OR revision."digest"<>NEW."manifestDigest"
 OR used."versionCode"<>NEW."versionCode" OR receipt."versionCode"<>NEW."versionCode"
 OR claim."expiresAt"<=CURRENT_TIMESTAMP
 OR (revision."manifest"->>'buildMode') IS DISTINCT FROM 'TEST'
 OR (revision."manifest"->>'sourceSha') IS DISTINCT FROM used."sourceSha"
 OR (revision."manifest"->>'lockDigest') IS DISTINCT FROM used."lockDigest"
 OR NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" a
  WHERE a."proposalId"=proposal."id" AND NOT EXISTS (
   SELECT 1 FROM "PartnerDistributionRevocation" revoked WHERE revoked."approvalId"=a."id"))
 OR NOT EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" a WHERE a."revisionId"=revision."id")
 OR EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevision" newer
  WHERE newer."proposalId"=proposal."id" AND newer."version">revision."version")
 THEN RAISE EXCEPTION 'Current consumed TEST runner allocation and version required' USING ERRCODE='23514'; END IF;
 IF NEW."issuedAt">CURRENT_TIMESTAMP+INTERVAL '5 seconds'
 OR NEW."issuedAt"<CURRENT_TIMESTAMP-INTERVAL '30 seconds'
 OR NEW."expiresAt"<=CURRENT_TIMESTAMP
 THEN RAISE EXCEPTION 'Expired TEST runner challenge' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_runner_challenge_valid"
 BEFORE INSERT ON "PartnerAndroidRunnerChallenge" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5514_runner_challenge_guard();
CREATE TRIGGER "android_runner_challenge_immutable"
 BEFORE UPDATE OR DELETE ON "PartnerAndroidRunnerChallenge" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
