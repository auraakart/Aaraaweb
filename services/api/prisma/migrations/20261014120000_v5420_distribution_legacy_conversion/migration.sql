BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- CreateTable
CREATE TABLE "PartnerDistributionProposal" (
    "id" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "applicationId" VARCHAR(150) NOT NULL,
    "manifest" JSONB NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "actorId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerDistributionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDistributionApproval" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerDistributionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDistributionRevocation" (
    "id" UUID NOT NULL,
    "approvalId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerDistributionRevocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyLegacySubscription" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "sourceMigration" TEXT NOT NULL,
    "productTier" "ProductTier" NOT NULL,
    "featureOverrides" JSONB NOT NULL,
    "enabledFeatures" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyLegacySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDistributionProposal_applicationId_key" ON "PartnerDistributionProposal"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDistributionProposal_allocationId_idempotencyKey_key" ON "PartnerDistributionProposal"("allocationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDistributionApproval_proposalId_key" ON "PartnerDistributionApproval"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDistributionRevocation_approvalId_key" ON "PartnerDistributionRevocation"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyLegacySubscription_allocationId_key" ON "SocietyLegacySubscription"("allocationId");

-- CreateIndex
CREATE INDEX "SocietyLegacySubscription_societyId_createdAt_idx" ON "SocietyLegacySubscription"("societyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyLegacySubscription_societyId_idempotencyKey_key" ON "SocietyLegacySubscription"("societyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PartnerDistributionProposal" ADD CONSTRAINT "PartnerDistributionProposal_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "SocietyLicenseAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDistributionProposal" ADD CONSTRAINT "PartnerDistributionProposal_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDistributionApproval" ADD CONSTRAINT "PartnerDistributionApproval_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "PartnerDistributionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDistributionApproval" ADD CONSTRAINT "PartnerDistributionApproval_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDistributionRevocation" ADD CONSTRAINT "PartnerDistributionRevocation_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "PartnerDistributionApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDistributionRevocation" ADD CONSTRAINT "PartnerDistributionRevocation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyLegacySubscription" ADD CONSTRAINT "SocietyLegacySubscription_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "SocietyEntitlementCompatibility"("societyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyLegacySubscription" ADD CONSTRAINT "SocietyLegacySubscription_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "SocietyLicenseAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyLegacySubscription" ADD CONSTRAINT "SocietyLegacySubscription_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every new row is checked against locked live licensing context, not a stale receipt.
CREATE FUNCTION aaraagate_v5420_allocation(allocation_id UUID, actor UUID)
 RETURNS "SocietyLicenseAllocation" LANGUAGE plpgsql AS $$
DECLARE a "SocietyLicenseAllocation"%ROWTYPE; approval "PartnerLicenseApproval"%ROWTYPE;
 g "PartnerLicenseGrant"%ROWTYPE; c "SocietyLicenseConsent"%ROWTYPE; s "Society"%ROWTYPE; plan "PartnerLicensePlanRevision"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM "SocietyLicenseAllocation" WHERE "id"=allocation_id;
 SELECT * INTO STRICT approval FROM "PartnerLicenseApproval" WHERE "id"=a."approvalId";
 g:=aaraagate_v5454_context(a."societyId",approval."grantId",a."ownershipVersion",true);
 PERFORM aaraagate_v5454_operator(actor,a."societyId",false);
 SELECT * INTO STRICT c FROM "SocietyLicenseConsent" WHERE "id"=a."consentId";
 SELECT * INTO STRICT s FROM "Society" WHERE "id"=a."societyId";
 SELECT * INTO STRICT plan FROM "PartnerLicensePlanRevision" WHERE "id"=g."planRevisionId";
 IF statement_timestamp()<g."startsAt" OR statement_timestamp()>=g."endsAt" OR approval."grantVersion"<>g."version"
 OR EXISTS (SELECT 1 FROM "PartnerLicenseRevocation" WHERE "approvalId"=approval."id")
 OR c."societyId"<>s."id" OR c."grantId"<>g."id" OR c."ownershipVersion"<>s."ownershipVersion"
 OR c."grantVersion"<>g."version" OR c."decision"<>'OPT_IN'
 OR c."productTier"<>s."productTier" OR c."featureOverrides" IS DISTINCT FROM s."featureOverrides"
 OR c."enabledFeatures" IS DISTINCT FROM aaraagate_v5454_features(s."productTier",s."featureOverrides")
 OR NOT (plan."featureAllowlist" @> c."enabledFeatures")
 OR EXISTS (SELECT 1 FROM "SocietyLicenseConsent" later WHERE later."societyId"=c."societyId"
 AND later."grantId"=c."grantId" AND later."ownershipVersion"=c."ownershipVersion" AND later."sequence">c."sequence") THEN
 RAISE EXCEPTION 'Current compatible licensed allocation required' USING ERRCODE='23514';
 END IF;
 RETURN a;
END $$;
ALTER TABLE "PartnerDistributionProposal" ADD CONSTRAINT "distribution_manifest_shape" CHECK ((
 jsonb_typeof("manifest")='object' AND "manifest" ?& ARRAY['schemaVersion','environment','applicationId','namespace','appRole','label','sourceSha','configDigest','signingProfile','apiOrigin']
 AND "manifest" - ARRAY['schemaVersion','environment','applicationId','namespace','appRole','label','sourceSha','configDigest','signingProfile','apiOrigin']='{}'::jsonb
 AND "manifest"->'schemaVersion'='1'::jsonb AND "manifest"->>'environment'='TEST'
 AND "manifest"->>'applicationId'="applicationId" AND "manifest"->>'namespace'="applicationId"
 AND "applicationId" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'
 AND "applicationId" !~ '^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb)(\.|$)'
 AND "manifest"->>'appRole' IN ('RESIDENT','GUARD')
 AND jsonb_typeof("manifest"->'label')='string' AND length(btrim("manifest"->>'label')) BETWEEN 1 AND 60
 AND "manifest"->>'sourceSha' ~ '^[0-9a-f]{40}$' AND "manifest"->>'configDigest' ~ '^[0-9a-f]{64}$'
 AND "manifest"->>'signingProfile' ~ '^TEST_[A-Z0-9_]{3,60}$'
 AND "manifest"->>'apiOrigin' ~ '^https://[^/?#@]+$' AND "digest" ~ '^[0-9a-f]{64}$'
) IS TRUE);
ALTER TABLE "PartnerDistributionApproval" ADD CHECK (length(btrim("reason")) BETWEEN 3 AND 500);
ALTER TABLE "PartnerDistributionRevocation" ADD CHECK (length(btrim("reason")) BETWEEN 3 AND 500);
CREATE FUNCTION aaraagate_v5420_distribution_proposal_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM aaraagate_v5420_allocation(NEW."allocationId",NEW."actorId");
 RETURN NEW;
END $$;
CREATE TRIGGER "distribution_proposal_valid" BEFORE INSERT ON "PartnerDistributionProposal" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5420_distribution_proposal_check();
CREATE FUNCTION aaraagate_v5420_distribution_approval_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE p "PartnerDistributionProposal"%ROWTYPE; a "SocietyLicenseAllocation"%ROWTYPE; maximum INTEGER; used INTEGER;
BEGIN
 SELECT * INTO STRICT p FROM "PartnerDistributionProposal" WHERE "id"=NEW."proposalId";
 a:=aaraagate_v5420_allocation(p."allocationId",NEW."actorId");
 PERFORM aaraagate_v5454_operator(p."actorId",a."societyId",false);
 IF p."actorId"=NEW."actorId" THEN RAISE EXCEPTION 'Independent distribution approval required' USING ERRCODE='23514'; END IF;
 SELECT plan."maximumDistributions" INTO STRICT maximum FROM "PartnerLicensePlanRevision" plan
 JOIN "PartnerLicenseGrant" g ON g."planRevisionId"=plan."id" JOIN "PartnerLicenseApproval" approval ON approval."grantId"=g."id" WHERE approval."id"=a."approvalId";
 SELECT count(*) INTO used FROM "PartnerDistributionApproval" d JOIN "PartnerDistributionProposal" proposal ON proposal."id"=d."proposalId"
 JOIN "SocietyLicenseAllocation" allocation ON allocation."id"=proposal."allocationId" WHERE allocation."approvalId"=a."approvalId"
 AND NOT EXISTS (SELECT 1 FROM "PartnerDistributionRevocation" r WHERE r."approvalId"=d."id");
 IF used>=maximum THEN RAISE EXCEPTION 'Distribution capacity exhausted' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "distribution_approval_valid" BEFORE INSERT ON "PartnerDistributionApproval" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5420_distribution_approval_check();
CREATE FUNCTION aaraagate_v5420_distribution_revocation_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE society UUID; grant_id UUID;
BEGIN
 SELECT a."societyId",license."grantId" INTO STRICT society,grant_id FROM "PartnerDistributionApproval" d
 JOIN "PartnerDistributionProposal" p ON p."id"=d."proposalId" JOIN "SocietyLicenseAllocation" a ON a."id"=p."allocationId"
 JOIN "PartnerLicenseApproval" license ON license."id"=a."approvalId" WHERE d."id"=NEW."approvalId";
 PERFORM 1 FROM "Society" WHERE "id"=society FOR UPDATE;
 PERFORM aaraagate_v5454_operator(NEW."actorId",society,false);
 PERFORM 1 FROM "PartnerLicenseGrant" WHERE "id"=grant_id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER "distribution_revocation_valid" BEFORE INSERT ON "PartnerDistributionRevocation" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5420_distribution_revocation_check();
CREATE FUNCTION aaraagate_v5420_legacy_conversion_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE a "SocietyLicenseAllocation"%ROWTYPE; b "SocietyEntitlementCompatibility"%ROWTYPE; s "Society"%ROWTYPE;
BEGIN
 a:=aaraagate_v5420_allocation(NEW."allocationId",NEW."actorId");
 SELECT * INTO STRICT b FROM "SocietyEntitlementCompatibility" WHERE "societyId"=a."societyId";
 SELECT * INTO STRICT s FROM "Society" WHERE "id"=a."societyId";
 IF NEW."societyId"<>a."societyId" OR NEW."sourceMigration"<>b."sourceMigration"
 OR NEW."productTier"<>b."sourceProductTier" OR NEW."productTier"<>s."productTier"
 OR NEW."featureOverrides" IS DISTINCT FROM b."sourceOverrides" OR NEW."featureOverrides" IS DISTINCT FROM s."featureOverrides"
 OR NEW."enabledFeatures" IS DISTINCT FROM b."enabledFeatures"
 OR NEW."enabledFeatures" IS DISTINCT FROM aaraagate_v5454_features(s."productTier",s."featureOverrides") THEN
 RAISE EXCEPTION 'Historical legacy compatibility changed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "legacy_conversion_valid" BEFORE INSERT ON "SocietyLegacySubscription" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5420_legacy_conversion_check();
CREATE TRIGGER "distribution_proposal_immutable" BEFORE UPDATE OR DELETE ON "PartnerDistributionProposal" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "distribution_approval_immutable" BEFORE UPDATE OR DELETE ON "PartnerDistributionApproval" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "distribution_revocation_immutable" BEFORE UPDATE OR DELETE ON "PartnerDistributionRevocation" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "legacy_subscription_immutable" BEFORE UPDATE OR DELETE ON "SocietyLegacySubscription" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();

COMMIT;
