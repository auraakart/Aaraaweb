BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerAndroidBuildWorkerConsumption" (
 "id" UUID NOT NULL,
 "claimId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "workerId" VARCHAR(64) NOT NULL,
 "manifestDigest" VARCHAR(64) NOT NULL,
 "nonceDigest" VARCHAR(64) NOT NULL,
 "sourceSha" VARCHAR(40) NOT NULL,
 "lockDigest" VARCHAR(64) NOT NULL,
 "versionCode" INTEGER NOT NULL,
 "issuedAt" TIMESTAMPTZ(6) NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidBuildWorkerConsumption_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidWorkerConsumption_worker_shape" CHECK ("workerId" ~ '^TEST_WORKER_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidWorkerConsumption_digest_shapes" CHECK (
  "manifestDigest" ~ '^[0-9a-f]{64}$' AND "nonceDigest" ~ '^[0-9a-f]{64}$'
  AND "sourceSha" ~ '^[0-9a-f]{40}$' AND "lockDigest" ~ '^[0-9a-f]{64}$'
 ),
 CONSTRAINT "AndroidWorkerConsumption_version_range" CHECK ("versionCode" BETWEEN 1 AND 2100000000),
 CONSTRAINT "AndroidWorkerConsumption_time_range" CHECK ("expiresAt">"issuedAt" AND "expiresAt"<="issuedAt"+INTERVAL '2 minutes')
);
CREATE UNIQUE INDEX "PartnerAndroidBuildWorkerConsumption_claimId_key"
 ON "PartnerAndroidBuildWorkerConsumption"("claimId");
CREATE INDEX "PartnerAndroidBuildWorkerConsumption_workerId_createdAt_idx"
 ON "PartnerAndroidBuildWorkerConsumption"("workerId","createdAt");
ALTER TABLE "PartnerAndroidBuildWorkerConsumption" ADD CONSTRAINT "PartnerAndroidBuildWorkerConsumption_claimId_fkey"
 FOREIGN KEY ("claimId") REFERENCES "PartnerAndroidBuildWorkerClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildWorkerConsumption" ADD CONSTRAINT "PartnerAndroidBuildWorkerConsumption_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION aaraagate_v558_worker_consumption_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE claim "PartnerAndroidBuildWorkerClaim"%ROWTYPE;
 receipt "PartnerAndroidBuildReservation"%ROWTYPE;
 revision "PartnerAndroidBuildRevision"%ROWTYPE;
 proposal "PartnerDistributionProposal"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT claim FROM "PartnerAndroidBuildWorkerClaim" WHERE "id"=NEW."claimId" FOR SHARE;
 SELECT * INTO STRICT receipt FROM "PartnerAndroidBuildReservation" WHERE "id"=claim."reservationId" FOR SHARE;
 SELECT * INTO STRICT revision FROM "PartnerAndroidBuildRevision" WHERE "id"=receipt."revisionId" FOR SHARE;
 SELECT * INTO STRICT proposal FROM "PartnerDistributionProposal" WHERE "id"=receipt."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(proposal."allocationId",NEW."actorId");
 IF claim."actorId"<>NEW."actorId" OR claim."workerId"<>NEW."workerId"
 OR claim."manifestDigest"<>NEW."manifestDigest" OR claim."versionCode"<>NEW."versionCode"
 OR claim."expiresAt"<=CURRENT_TIMESTAMP
 OR receipt."digest"<>claim."manifestDigest" OR receipt."versionCode"<>claim."versionCode"
 OR revision."proposalId"<>proposal."id" OR revision."digest"<>claim."manifestDigest"
 OR (revision."manifest"->>'buildMode') IS DISTINCT FROM 'TEST'
 OR (revision."manifest"->>'sourceSha') IS DISTINCT FROM NEW."sourceSha"
 OR (revision."manifest"->>'lockDigest') IS DISTINCT FROM NEW."lockDigest"
 OR NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" a
  WHERE a."proposalId"=proposal."id" AND NOT EXISTS (
   SELECT 1 FROM "PartnerDistributionRevocation" revoked WHERE revoked."approvalId"=a."id"))
 OR NOT EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" review WHERE review."revisionId"=revision."id")
 OR EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevision" newer
  WHERE newer."proposalId"=proposal."id" AND newer."version">revision."version")
 THEN RAISE EXCEPTION 'Current TEST worker claim, reservation and source authority required' USING ERRCODE='23514'; END IF;
 IF NEW."issuedAt">CURRENT_TIMESTAMP+INTERVAL '5 seconds'
 OR NEW."issuedAt"<CURRENT_TIMESTAMP-INTERVAL '30 seconds'
 OR NEW."expiresAt"<=CURRENT_TIMESTAMP
 THEN RAISE EXCEPTION 'Expired TEST worker consumption assertion' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_worker_consumption_valid"
 BEFORE INSERT ON "PartnerAndroidBuildWorkerConsumption" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_v558_worker_consumption_guard();
CREATE TRIGGER "android_worker_consumption_immutable"
 BEFORE UPDATE OR DELETE ON "PartnerAndroidBuildWorkerConsumption" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
