-- AlterTable
ALTER TABLE "DevicePushToken" ADD COLUMN     "applicationId" UUID,
ADD COLUMN     "firebaseProjectId" VARCHAR(150);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "partnerApplicationId" UUID;

-- CreateTable
CREATE TABLE "PartnerBrandRevision" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "publishedById" UUID,
    "reason" VARCHAR(500),

    CONSTRAINT "PartnerBrandRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyBrandPublication" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "publisherId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "previousRevisionId" UUID,
    "restoredFromRevisionId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyBrandPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "applicationId" VARCHAR(150) NOT NULL,
    "appRole" VARCHAR(16) NOT NULL,
    "signerFingerprint" VARCHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplicationScope" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "ownershipVersion" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(6),
    "revokedById" UUID,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PartnerApplicationScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerBrandRevision_partnerId_publishedAt_version_idx" ON "PartnerBrandRevision"("partnerId", "publishedAt" DESC, "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerBrandRevision_partnerId_version_key" ON "PartnerBrandRevision"("partnerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyBrandPublication_revisionId_key" ON "SocietyBrandPublication"("revisionId");

-- CreateIndex
CREATE INDEX "SocietyBrandPublication_societyId_createdAt_idx" ON "SocietyBrandPublication"("societyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplication_applicationId_key" ON "PartnerApplication"("applicationId");

-- CreateIndex
CREATE INDEX "PartnerApplication_partnerId_appRole_idx" ON "PartnerApplication"("partnerId", "appRole");

-- CreateIndex
CREATE INDEX "PartnerApplicationScope_societyId_applicationId_idx" ON "PartnerApplicationScope"("societyId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplicationScope_applicationId_allocationId_key" ON "PartnerApplicationScope"("applicationId", "allocationId");

-- AddForeignKey
ALTER TABLE "PartnerBrandRevision" ADD CONSTRAINT "PartnerBrandRevision_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerBrandRevision" ADD CONSTRAINT "PartnerBrandRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerBrandRevision" ADD CONSTRAINT "PartnerBrandRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyBrandPublication" ADD CONSTRAINT "SocietyBrandPublication_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyBrandPublication" ADD CONSTRAINT "SocietyBrandPublication_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "SocietyBrandRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyBrandPublication" ADD CONSTRAINT "SocietyBrandPublication_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "PartnerApplicationScope_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "PartnerApplicationScope_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "PartnerApplicationScope_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "SocietyLicenseAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "PartnerApplicationScope_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "PartnerApplicationScope_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "PartnerApplicationScope_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Native identity policy matches the shared API/build validator. Historical
-- proposals are retained; NOT VALID constraints still govern every new write.
CREATE FUNCTION aaraagate_v59_android_identity(value text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(length(value)<=150 AND value ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'
 AND value !~ '^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb|com\.aaraaplatforms)(\.|$)'
 AND NOT EXISTS (SELECT 1 FROM unnest(string_to_array(value,'.')) part WHERE part=ANY(string_to_array('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _',' '))),false)
$$;
ALTER TABLE "PartnerDistributionProposal" ADD CONSTRAINT "v59_distribution_identity" CHECK (aaraagate_v59_android_identity("applicationId")) NOT VALID;
ALTER TABLE "PartnerAndroidBuildRevision" ADD CONSTRAINT "v59_revision_identity" CHECK (aaraagate_v59_android_identity("manifest"->>'applicationId')) NOT VALID;
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "v59_application_identity" CHECK (aaraagate_v59_android_identity("applicationId") AND "appRole" IN ('RESIDENT','GUARD') AND "signerFingerprint" ~ '^[a-f0-9]{64}$');
ALTER TABLE "PartnerBrandRevision" ADD CONSTRAINT "v59_partner_brand_shape" CHECK ("version">0 AND "digest" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("config")='object' AND "config" ?& ARRAY['presentation','societyOverrideFields'] AND "config" - ARRAY['presentation','societyOverrideFields']='{}'::jsonb AND jsonb_typeof("config"->'presentation')='object' AND ("config"->'presentation') - ARRAY['displayName','colors','support']='{}'::jsonb AND jsonb_typeof("config"->'societyOverrideFields')='array' AND ("config"->'societyOverrideFields') <@ '["displayName","colors","support","logoAssetId"]'::jsonb AND (("publishedAt" IS NULL AND "publishedById" IS NULL AND "reason" IS NULL) OR ("publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL AND "reason" IS NOT NULL AND length(btrim("reason")) BETWEEN 3 AND 500)));
ALTER TABLE "PartnerApplicationScope" ADD CONSTRAINT "v59_scope_shape" CHECK ("ownershipVersion">0 AND (("approvedAt" IS NULL AND "approvedById" IS NULL) OR ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "approvedById"<>"createdById")) AND (("revokedAt" IS NULL AND "revokedById" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL)));
ALTER TABLE "Session" ADD CONSTRAINT "v59_session_application_fkey" FOREIGN KEY ("partnerApplicationId") REFERENCES "PartnerApplication"("id") ON DELETE RESTRICT;
ALTER TABLE "Session" ADD CONSTRAINT "v59_session_application_scope" CHECK ("partnerApplicationId" IS NULL OR ("societyId" IS NOT NULL AND "audience"='STANDARD'));
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "v59_push_application_fkey" FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id") ON DELETE RESTRICT;
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "v59_push_project_pair" CHECK (("applicationId" IS NULL AND "firebaseProjectId" IS NULL) OR ("applicationId" IS NOT NULL AND "firebaseProjectId" IS NOT NULL AND "firebaseProjectId" ~ '^[a-z][a-z0-9-]{4,61}[a-z0-9]$'));

CREATE FUNCTION aaraagate_v59_partner_editor(partner uuid, actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM "id" FROM "Partner" WHERE "id"=partner AND "status"='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM "PartnerMembership" m JOIN "User" u ON u."id"=m."userId" WHERE m."partnerId"=partner AND m."userId"=actor AND m."active" AND m."role" IN ('OWNER','BRAND_MANAGER') AND u."status"='ACTIVE') THEN RAISE EXCEPTION 'Current partner editor required' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION aaraagate_v59_partner_brand_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM aaraagate_v59_partner_editor(NEW."partnerId",NEW."createdById");
  IF NEW."publishedAt" IS NOT NULL OR NEW."version"<>(SELECT coalesce(max("version"),0)+1 FROM "PartnerBrandRevision" WHERE "partnerId"=NEW."partnerId") THEN RAISE EXCEPTION 'New immutable draft version required' USING ERRCODE='23514'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF OLD."publishedAt" IS NOT NULL OR NEW."publishedAt" IS NULL OR NEW."publishedById" IS NULL OR (to_jsonb(NEW)-ARRAY['publishedAt','publishedById','reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['publishedAt','publishedById','reason']) THEN RAISE EXCEPTION 'Partner brand revision is immutable' USING ERRCODE='23514'; END IF;
  PERFORM aaraagate_v59_partner_editor(NEW."partnerId",NEW."publishedById");
  IF EXISTS(SELECT 1 FROM "PartnerBrandRevision" WHERE "partnerId"=NEW."partnerId" AND "publishedAt" IS NOT NULL AND "version">=NEW."version") THEN RAISE EXCEPTION 'Older revision cannot replace published branding' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Partner brand evidence cannot be deleted' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v59_partner_brand_write" BEFORE INSERT OR UPDATE OR DELETE ON "PartnerBrandRevision" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_partner_brand_write();
CREATE FUNCTION aaraagate_v59_application_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM aaraagate_v59_partner_editor(NEW."partnerId",NEW."createdById");
 PERFORM pg_advisory_xact_lock(hashtextextended('v59-native:'||NEW."applicationId",0));
 IF EXISTS(SELECT 1 FROM "PartnerDistributionProposal" WHERE "applicationId"=NEW."applicationId") THEN RAISE EXCEPTION 'Legacy application identity requires explicit migration' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v59_application_insert" BEFORE INSERT ON "PartnerApplication" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_application_insert();
-- Prevent old proposal APIs reserving an identity registered on the partner plane.
CREATE FUNCTION aaraagate_v59_legacy_identity_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('v59-native:'||NEW."applicationId",0));
 IF EXISTS(SELECT 1 FROM "PartnerApplication" WHERE "applicationId"=NEW."applicationId") THEN RAISE EXCEPTION 'Application identity already registered' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v59_legacy_identity_insert" BEFORE INSERT ON "PartnerDistributionProposal" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_legacy_identity_insert();
CREATE FUNCTION aaraagate_v59_no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'White label identity/evidence is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "v59_application_immutable" BEFORE UPDATE OR DELETE ON "PartnerApplication" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_no_rewrite();
CREATE TRIGGER "v59_publication_immutable" BEFORE UPDATE OR DELETE ON "SocietyBrandPublication" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_no_rewrite();
CREATE FUNCTION aaraagate_v59_publication_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "SocietyBrandRevision" WHERE "id"=NEW."revisionId" AND "societyId"=NEW."societyId" AND "publishedAt" IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM "SocietyMembership" m JOIN "User" u ON u."id"=m."userId" WHERE m."userId"=NEW."publisherId" AND m."societyId"=NEW."societyId" AND m."active" AND m."role" IN ('SOCIETY_ADMIN','SUPER_ADMIN') AND u."status"='ACTIVE') THEN RAISE EXCEPTION 'Current society publication authority required' USING ERRCODE='23514'; END IF;
 IF NEW."previousRevisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "SocietyBrandRevision" WHERE "id"=NEW."previousRevisionId" AND "societyId"=NEW."societyId" AND "publishedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Foreign previous publication' USING ERRCODE='23514'; END IF;
 IF NEW."restoredFromRevisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "SocietyBrandRevision" old JOIN "SocietyBrandRevision" current ON current."id"=NEW."revisionId" WHERE old."id"=NEW."restoredFromRevisionId" AND old."societyId"=NEW."societyId" AND old."publishedAt" IS NOT NULL AND old."version"<current."version" AND old."digest"=current."digest" AND old."config"=current."config") THEN RAISE EXCEPTION 'Invalid restore lineage' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v59_publication_insert" BEFORE INSERT ON "SocietyBrandPublication" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_publication_insert();
CREATE FUNCTION aaraagate_v59_scope_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "SocietyLicenseAllocation"; s "Society"; app "PartnerApplication"; maximum integer; used integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Application scope evidence cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT app FROM "PartnerApplication" WHERE "id"=NEW."applicationId";
 SELECT * INTO STRICT s FROM "Society" WHERE "id"=NEW."societyId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  a:=aaraagate_v5420_allocation(NEW."allocationId",NEW."createdById");
  IF a."societyId"<>s."id" OR a."ownershipVersion"<>NEW."ownershipVersion" OR s."partnerId"<>app."partnerId" OR NEW."approvedAt" IS NOT NULL OR NEW."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Foreign or already approved application scope' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['approvedAt','approvedById','revokedAt','revokedById']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approvedAt','approvedById','revokedAt','revokedById']) THEN RAISE EXCEPTION 'Application scope identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Revoked scope cannot change' USING ERRCODE='23514'; END IF;
  IF NEW."revokedAt" IS NOT NULL THEN
   IF (NEW."approvedAt",NEW."approvedById") IS DISTINCT FROM (OLD."approvedAt",OLD."approvedById") OR NOT EXISTS(SELECT 1 FROM "SocietyMembership" m JOIN "User" u ON u."id"=m."userId" WHERE m."societyId"=s."id" AND m."userId"=NEW."revokedById" AND m."active" AND m."role"='SUPER_ADMIN' AND u."status"='ACTIVE') THEN RAISE EXCEPTION 'Current society revocation authority required' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD."approvedAt" IS NOT NULL OR NEW."approvedAt" IS NULL THEN RAISE EXCEPTION 'Application review is immutable' USING ERRCODE='23514'; END IF;
   a:=aaraagate_v5420_allocation(NEW."allocationId",NEW."approvedById");
   SELECT plan."maximumDistributions" INTO STRICT maximum FROM "PartnerLicenseApproval" approval JOIN "PartnerLicenseGrant" g ON g."id"=approval."grantId" JOIN "PartnerLicensePlanRevision" plan ON plan."id"=g."planRevisionId" WHERE approval."id"=a."approvalId";
   IF NOT EXISTS(SELECT 1 FROM "PartnerApplicationScope" scope JOIN "SocietyLicenseAllocation" allocation ON allocation."id"=scope."allocationId" WHERE allocation."approvalId"=a."approvalId" AND scope."applicationId"=NEW."applicationId" AND scope."approvedAt" IS NOT NULL AND scope."revokedAt" IS NULL) THEN
    SELECT count(DISTINCT scope."applicationId") INTO used FROM "PartnerApplicationScope" scope JOIN "SocietyLicenseAllocation" allocation ON allocation."id"=scope."allocationId" WHERE allocation."approvalId"=a."approvalId" AND scope."approvedAt" IS NOT NULL AND scope."revokedAt" IS NULL;
    used:=used+(SELECT count(*) FROM "PartnerDistributionApproval" approval JOIN "PartnerDistributionProposal" proposal ON proposal."id"=approval."proposalId" JOIN "SocietyLicenseAllocation" allocation ON allocation."id"=proposal."allocationId" WHERE allocation."approvalId"=a."approvalId" AND NOT EXISTS(SELECT 1 FROM "PartnerDistributionRevocation" WHERE "approvalId"=approval."id"));
    IF used>=maximum THEN RAISE EXCEPTION 'Licensed application capacity exhausted' USING ERRCODE='23514'; END IF;
   END IF;
   IF s."partnerId"<>app."partnerId" OR s."ownershipVersion"<>NEW."ownershipVersion" OR NOT EXISTS(SELECT 1 FROM "SocietyMembership" m JOIN "User" u ON u."id"=m."userId" WHERE m."societyId"=s."id" AND m."userId"=NEW."createdById" AND m."active" AND m."role"='SUPER_ADMIN' AND u."status"='ACTIVE') THEN RAISE EXCEPTION 'Application scope maker/ownership changed' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v59_scope_write" BEFORE INSERT OR UPDATE OR DELETE ON "PartnerApplicationScope" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_scope_write();

ALTER TABLE "SocietyBrandPublication" ADD CONSTRAINT "v59_publication_reason" CHECK (length(btrim("reason")) BETWEEN 3 AND 500);

CREATE FUNCTION aaraagate_v59_legacy_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "SocietyLicenseAllocation"; p "PartnerDistributionProposal"; maximum integer; used integer;
BEGIN
 SELECT * INTO STRICT p FROM "PartnerDistributionProposal" WHERE "id"=NEW."proposalId";
 a:=aaraagate_v5420_allocation(p."allocationId",NEW."actorId");
 SELECT plan."maximumDistributions" INTO STRICT maximum FROM "PartnerLicenseApproval" approval JOIN "PartnerLicenseGrant" g ON g."id"=approval."grantId" JOIN "PartnerLicensePlanRevision" plan ON plan."id"=g."planRevisionId" WHERE approval."id"=a."approvalId";
 SELECT count(DISTINCT scope."applicationId") INTO used FROM "PartnerApplicationScope" scope JOIN "SocietyLicenseAllocation" allocation ON allocation."id"=scope."allocationId" WHERE allocation."approvalId"=a."approvalId" AND scope."approvedAt" IS NOT NULL AND scope."revokedAt" IS NULL;
 used:=used+(SELECT count(*) FROM "PartnerDistributionApproval" approval JOIN "PartnerDistributionProposal" proposal ON proposal."id"=approval."proposalId" JOIN "SocietyLicenseAllocation" allocation ON allocation."id"=proposal."allocationId" WHERE allocation."approvalId"=a."approvalId" AND NOT EXISTS(SELECT 1 FROM "PartnerDistributionRevocation" WHERE "approvalId"=approval."id"));
 IF used>=maximum THEN RAISE EXCEPTION 'Licensed application capacity exhausted' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v59_legacy_capacity" BEFORE INSERT ON "PartnerDistributionApproval" FOR EACH ROW EXECUTE FUNCTION aaraagate_v59_legacy_capacity();
