BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerAndroidBuildWorkerClaim" (
 "id" UUID NOT NULL,
 "reservationId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "workerId" VARCHAR(64) NOT NULL,
 "assertionDigest" VARCHAR(64) NOT NULL,
 "nonceDigest" VARCHAR(64) NOT NULL,
 "manifestDigest" VARCHAR(64) NOT NULL,
 "versionCode" INTEGER NOT NULL,
 "issuedAt" TIMESTAMPTZ(6) NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerAndroidBuildWorkerClaim_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AndroidWorkerClaim_worker_shape" CHECK ("workerId" ~ '^TEST_WORKER_[A-Z0-9_]{3,48}$'),
 CONSTRAINT "AndroidWorkerClaim_digest_shapes" CHECK (
  "assertionDigest" ~ '^[0-9a-f]{64}$' AND
  "nonceDigest" ~ '^[0-9a-f]{64}$' AND
  "manifestDigest" ~ '^[0-9a-f]{64}$'
 ),
 CONSTRAINT "AndroidWorkerClaim_version_range" CHECK ("versionCode" BETWEEN 1 AND 2100000000),
 CONSTRAINT "AndroidWorkerClaim_time_range" CHECK ("expiresAt">"issuedAt" AND "expiresAt"<="issuedAt"+INTERVAL '2 minutes')
);
CREATE UNIQUE INDEX "PartnerAndroidBuildWorkerClaim_reservationId_key"
 ON "PartnerAndroidBuildWorkerClaim"("reservationId");
CREATE INDEX "PartnerAndroidBuildWorkerClaim_workerId_createdAt_idx"
 ON "PartnerAndroidBuildWorkerClaim"("workerId","createdAt");
ALTER TABLE "PartnerAndroidBuildWorkerClaim" ADD CONSTRAINT "PartnerAndroidBuildWorkerClaim_reservationId_fkey"
 FOREIGN KEY ("reservationId") REFERENCES "PartnerAndroidBuildReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAndroidBuildWorkerClaim" ADD CONSTRAINT "PartnerAndroidBuildWorkerClaim_actorId_fkey"
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION aaraagate_v557_worker_claim_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE reservation "PartnerAndroidBuildReservation"%ROWTYPE;
 revision "PartnerAndroidBuildRevision"%ROWTYPE;
 proposal "PartnerDistributionProposal"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT reservation FROM "PartnerAndroidBuildReservation"
 WHERE "id"=NEW."reservationId" FOR SHARE;
 SELECT * INTO STRICT revision FROM "PartnerAndroidBuildRevision"
 WHERE "id"=reservation."revisionId" FOR SHARE;
 SELECT * INTO STRICT proposal FROM "PartnerDistributionProposal"
 WHERE "id"=reservation."proposalId" FOR UPDATE;
 PERFORM aaraagate_v5420_allocation(proposal."allocationId",NEW."actorId");
 IF NOT EXISTS (SELECT 1 FROM "PartnerDistributionApproval" a
   WHERE a."proposalId"=proposal."id" AND NOT EXISTS (
   SELECT 1 FROM "PartnerDistributionRevocation" revoked WHERE revoked."approvalId"=a."id"))
 OR NOT EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevisionApproval" reviewed
   WHERE reviewed."revisionId"=revision."id")
 OR EXISTS (SELECT 1 FROM "PartnerAndroidBuildRevision" newer
   WHERE newer."proposalId"=proposal."id" AND newer."version">revision."version")
 OR revision."proposalId"<>proposal."id"
 OR revision."digest"<>NEW."manifestDigest"
 OR reservation."digest"<>NEW."manifestDigest"
 OR reservation."versionCode"<>NEW."versionCode"
 OR (revision."manifest"->>'buildMode') IS DISTINCT FROM 'TEST'
 THEN RAISE EXCEPTION 'Latest approved TEST build reservation required' USING ERRCODE='23514'; END IF;
 IF NEW."issuedAt">CURRENT_TIMESTAMP+INTERVAL '5 seconds'
 OR NEW."issuedAt"<CURRENT_TIMESTAMP-INTERVAL '30 seconds'
 OR NEW."expiresAt"<=CURRENT_TIMESTAMP
 THEN RAISE EXCEPTION 'Expired TEST worker assertion' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "android_worker_claim_valid"
 BEFORE INSERT ON "PartnerAndroidBuildWorkerClaim" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_v557_worker_claim_guard();
CREATE TRIGGER "android_worker_claim_immutable"
 BEFORE UPDATE OR DELETE ON "PartnerAndroidBuildWorkerClaim" FOR EACH ROW
 EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
