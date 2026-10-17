-- Immutable approval/consent authority; existing DRAFT proposals and legacy features stay intact.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE "PartnerLicenseApproval" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 "grantId" UUID NOT NULL REFERENCES "PartnerLicenseGrant"("id") ON DELETE RESTRICT,
 "grantVersion" INTEGER NOT NULL CHECK ("grantVersion">0),
 "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
 "ownershipVersion" INTEGER NOT NULL CHECK ("ownershipVersion">0),
 "approvedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "idempotencyKey" UUID NOT NULL,
 "reason" VARCHAR(500) NOT NULL CHECK (length(btrim("reason")) BETWEEN 3 AND 500),
 "essentialPolicy" TEXT NOT NULL DEFAULT 'PRESERVE_LEGACY' CHECK ("essentialPolicy"='PRESERVE_LEGACY'),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PartnerLicenseApproval_grantId_key" ON "PartnerLicenseApproval"("grantId");
CREATE INDEX "PartnerLicenseApproval_societyId_createdAt_idx" ON "PartnerLicenseApproval"("societyId","createdAt");
CREATE TABLE "PartnerLicenseRevocation" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 "approvalId" UUID NOT NULL REFERENCES "PartnerLicenseApproval"("id") ON DELETE RESTRICT,
 "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
 "ownershipVersion" INTEGER NOT NULL CHECK ("ownershipVersion">0),
 "actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "idempotencyKey" UUID NOT NULL,
 "reason" VARCHAR(500) NOT NULL CHECK (length(btrim("reason")) BETWEEN 3 AND 500),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PartnerLicenseRevocation_approvalId_key" ON "PartnerLicenseRevocation"("approvalId");
CREATE INDEX "PartnerLicenseRevocation_societyId_createdAt_idx" ON "PartnerLicenseRevocation"("societyId","createdAt");
CREATE TABLE "SocietyLicenseConsent" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 "sequence" SERIAL NOT NULL,
 "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
 "ownershipVersion" INTEGER NOT NULL CHECK ("ownershipVersion">0),
 "grantId" UUID NOT NULL REFERENCES "PartnerLicenseGrant"("id") ON DELETE RESTRICT,
 "grantVersion" INTEGER NOT NULL CHECK ("grantVersion">0),
 "actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "decision" VARCHAR(16) NOT NULL CHECK ("decision" IN ('OPT_IN','WITHDRAW')),
 "idempotencyKey" UUID NOT NULL,
 "productTier" "ProductTier" NOT NULL,
 "featureOverrides" JSONB NOT NULL,
 "enabledFeatures" JSONB NOT NULL CHECK (jsonb_typeof("enabledFeatures")='array'),
 "compatibilityMigration" TEXT,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SocietyLicenseConsent_sequence_key" ON "SocietyLicenseConsent"("sequence");
CREATE UNIQUE INDEX "SocietyLicenseConsent_societyId_idempotencyKey_key" ON "SocietyLicenseConsent"("societyId","idempotencyKey");
CREATE INDEX "SocietyLicenseConsent_societyId_grantId_ownershipVersion_sequence_idx"
 ON "SocietyLicenseConsent"("societyId","grantId","ownershipVersion","sequence" DESC);
CREATE TABLE "SocietyLicenseAllocation" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 "approvalId" UUID NOT NULL REFERENCES "PartnerLicenseApproval"("id") ON DELETE RESTRICT,
 "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
 "ownershipVersion" INTEGER NOT NULL CHECK ("ownershipVersion">0),
 "consentId" UUID NOT NULL REFERENCES "SocietyLicenseConsent"("id") ON DELETE RESTRICT,
 "actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "idempotencyKey" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SocietyLicenseAllocation_consentId_key" ON "SocietyLicenseAllocation"("consentId");
CREATE UNIQUE INDEX "SocietyLicenseAllocation_approvalId_idempotencyKey_key" ON "SocietyLicenseAllocation"("approvalId","idempotencyKey");
CREATE INDEX "SocietyLicenseAllocation_societyId_ownershipVersion_idx" ON "SocietyLicenseAllocation"("societyId","ownershipVersion");

CREATE FUNCTION aaraagate_v5454_operator(actor UUID,society UUID,consent BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM "User" u JOIN "SocietyMembership" m ON m."userId"=u."id"
 WHERE u."id"=actor AND u."status"='ACTIVE' AND m."societyId"=society AND m."active"
 AND (m."role"='SUPER_ADMIN' OR (consent AND m."role"='SOCIETY_ADMIN')) FOR SHARE OF u,m;
 IF NOT FOUND THEN RAISE EXCEPTION 'License authority unavailable' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION aaraagate_v5454_context(society UUID,grant_id UUID,owner_version INTEGER,active_partner BOOLEAN)
 RETURNS "PartnerLicenseGrant" LANGUAGE plpgsql AS $$
DECLARE s "Society"%ROWTYPE; g "PartnerLicenseGrant"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT s FROM "Society" WHERE "id"=society FOR UPDATE;
 SELECT * INTO STRICT g FROM "PartnerLicenseGrant" WHERE "id"=grant_id FOR UPDATE;
 IF s."status"<>'ACTIVE' OR s."partnerId"<>g."partnerId" OR s."ownershipVersion"<>owner_version OR g."status"<>'DRAFT' THEN
  RAISE EXCEPTION 'License ownership context changed' USING ERRCODE='23514';
 END IF;
 IF active_partner THEN
  PERFORM 1 FROM "Partner" WHERE "id"=g."partnerId" AND "status"='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'License partner inactive' USING ERRCODE='23514'; END IF;
 END IF;
 IF owner_version>1 AND NOT EXISTS (SELECT 1 FROM "SocietyOwnershipTransfer" t
  JOIN "SocietyOwnershipTransferRequest" r ON r."id"=t."requestId"
  WHERE t."societyId"=society AND t."ownershipVersion"=owner_version AND r."toPartnerId"=g."partnerId") THEN
  RAISE EXCEPTION 'Audited ownership history required' USING ERRCODE='23514';
 END IF;
 RETURN g;
END $$;
-- Frozen v5 feature catalogue matches EntitlementService; future catalogue changes require a new reviewed migration.
CREATE FUNCTION aaraagate_v5454_features(tier "ProductTier",overrides JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT coalesce(jsonb_agg(f.feature ORDER BY f.ordinal),'[]'::jsonb) FROM (VALUES
 (1,'VISITOR_MANAGEMENT',1),(2,'DELIVERY_MANAGEMENT',2),(3,'DOMESTIC_HELP',2),(4,'NOTICES',1),
 (5,'HELPDESK',2),(6,'SOS',1),(7,'HOUSEHOLD_SERVICES',2),(8,'MAINTENANCE_BILLING',3),(9,'PAYMENTS',3),
 (10,'SOCIETY_ACCOUNTING',3),(11,'AMENITIES',3),(12,'GOVERNANCE_POLLS',4),(13,'ADVANCED_REPORTS',3),
 (14,'WHATSAPP_AUTOMATION',3),(15,'AI_ASSISTANT',4),(16,'CUSTOM_INTEGRATIONS',4)) f(ordinal,feature,minimum_tier)
 WHERE CASE WHEN jsonb_typeof(overrides->f.feature)='boolean' THEN (overrides->>f.feature)::boolean
 ELSE (CASE tier WHEN 'STARTER' THEN 1 WHEN 'PROFESSIONAL' THEN 2 WHEN 'PREMIUM' THEN 3 ELSE 4 END)>=f.minimum_tier END;
$$;
CREATE FUNCTION aaraagate_v5454_approval_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE g "PartnerLicenseGrant"%ROWTYPE;
BEGIN
 g:=aaraagate_v5454_context(NEW."societyId",NEW."grantId",NEW."ownershipVersion",true);
 IF g."createdById"=NEW."approvedById" OR g."version"<>NEW."grantVersion" OR statement_timestamp()>=g."endsAt" THEN
  RAISE EXCEPTION 'Independent current license approval required' USING ERRCODE='23514';
 END IF;
 PERFORM aaraagate_v5454_operator(g."createdById",NEW."societyId",false);
 PERFORM aaraagate_v5454_operator(NEW."approvedById",NEW."societyId",false);
 PERFORM 1 FROM "Partner" WHERE "id"=g."partnerId" FOR UPDATE;
 IF EXISTS (SELECT 1 FROM "PartnerLicenseApproval" a JOIN "PartnerLicenseGrant" prior ON prior."id"=a."grantId"
  WHERE prior."partnerId"=g."partnerId" AND prior."startsAt"<g."endsAt" AND g."startsAt"<prior."endsAt"
  AND NOT EXISTS (SELECT 1 FROM "PartnerLicenseRevocation" r WHERE r."approvalId"=a."id")) THEN
  RAISE EXCEPTION 'Approved partner license periods overlap' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PartnerLicenseApproval_valid" BEFORE INSERT ON "PartnerLicenseApproval" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5454_approval_check();
CREATE FUNCTION aaraagate_v5454_revocation_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE a "PartnerLicenseApproval"%ROWTYPE; g "PartnerLicenseGrant"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM "PartnerLicenseApproval" WHERE "id"=NEW."approvalId";
 g:=aaraagate_v5454_context(NEW."societyId",a."grantId",NEW."ownershipVersion",false);
 PERFORM aaraagate_v5454_operator(NEW."actorId",NEW."societyId",false);
 PERFORM 1 FROM "Partner" WHERE "id"=g."partnerId" FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER "PartnerLicenseRevocation_valid" BEFORE INSERT ON "PartnerLicenseRevocation" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5454_revocation_check();
CREATE FUNCTION aaraagate_v5454_consent_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE g "PartnerLicenseGrant"%ROWTYPE; s "Society"%ROWTYPE;
BEGIN
 g:=aaraagate_v5454_context(NEW."societyId",NEW."grantId",NEW."ownershipVersion",NEW."decision"='OPT_IN');
 PERFORM aaraagate_v5454_operator(NEW."actorId",NEW."societyId",true);
 SELECT * INTO STRICT s FROM "Society" WHERE "id"=NEW."societyId";
 IF NEW."grantVersion"<>g."version" OR NEW."productTier"<>s."productTier" OR NEW."featureOverrides" IS DISTINCT FROM s."featureOverrides"
  OR NEW."enabledFeatures" IS DISTINCT FROM aaraagate_v5454_features(s."productTier",s."featureOverrides") THEN
  RAISE EXCEPTION 'Legacy license snapshot changed' USING ERRCODE='23514';
 END IF;
 IF NEW."decision"='OPT_IN' AND statement_timestamp()>=g."endsAt" THEN
  RAISE EXCEPTION 'License opt-in period expired' USING ERRCODE='23514';
 END IF;
 IF (SELECT "decision" FROM "SocietyLicenseConsent" WHERE "societyId"=NEW."societyId"
  AND "grantId"=NEW."grantId" AND "ownershipVersion"=NEW."ownershipVersion" ORDER BY "sequence" DESC LIMIT 1)=NEW."decision" THEN
  RAISE EXCEPTION 'Consent decision already current' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "SocietyLicenseConsent_valid" BEFORE INSERT ON "SocietyLicenseConsent" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5454_consent_check();
CREATE FUNCTION aaraagate_v5454_used(approval UUID) RETURNS BIGINT LANGUAGE SQL STABLE AS $$
 SELECT count(*) FROM "SocietyLicenseAllocation" x JOIN "PartnerLicenseApproval" a ON a."id"=x."approvalId"
 JOIN "PartnerLicenseGrant" g ON g."id"=a."grantId" JOIN "Society" s ON s."id"=x."societyId"
 JOIN "SocietyLicenseConsent" c ON c."id"=x."consentId"
 WHERE x."approvalId"=approval AND s."partnerId"=g."partnerId" AND s."ownershipVersion"=x."ownershipVersion"
 AND c."decision"='OPT_IN' AND NOT EXISTS (SELECT 1 FROM "SocietyLicenseConsent" later
  WHERE later."societyId"=c."societyId" AND later."grantId"=c."grantId" AND later."ownershipVersion"=c."ownershipVersion" AND later."sequence">c."sequence");
$$;
CREATE FUNCTION aaraagate_v5454_allocation_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE a "PartnerLicenseApproval"%ROWTYPE; g "PartnerLicenseGrant"%ROWTYPE; c "SocietyLicenseConsent"%ROWTYPE;
 s "Society"%ROWTYPE; p "PartnerLicensePlanRevision"%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM "PartnerLicenseApproval" WHERE "id"=NEW."approvalId";
 g:=aaraagate_v5454_context(NEW."societyId",a."grantId",NEW."ownershipVersion",true);
 PERFORM aaraagate_v5454_operator(NEW."actorId",NEW."societyId",false);
 SELECT * INTO STRICT c FROM "SocietyLicenseConsent" WHERE "id"=NEW."consentId";
 SELECT * INTO STRICT s FROM "Society" WHERE "id"=NEW."societyId";
 SELECT * INTO STRICT p FROM "PartnerLicensePlanRevision" WHERE "id"=g."planRevisionId";
 IF statement_timestamp()<g."startsAt" OR statement_timestamp()>=g."endsAt" OR a."grantVersion"<>g."version"
  OR EXISTS (SELECT 1 FROM "PartnerLicenseRevocation" WHERE "approvalId"=a."id")
  OR c."societyId"<>s."id" OR c."grantId"<>g."id" OR c."ownershipVersion"<>s."ownershipVersion"
  OR c."grantVersion"<>g."version" OR c."decision"<>'OPT_IN'
  OR c."productTier"<>s."productTier" OR c."featureOverrides" IS DISTINCT FROM s."featureOverrides"
  OR c."enabledFeatures" IS DISTINCT FROM aaraagate_v5454_features(s."productTier",s."featureOverrides")
  OR NOT (p."featureAllowlist" @> c."enabledFeatures")
  OR EXISTS (SELECT 1 FROM "SocietyLicenseConsent" later WHERE later."societyId"=c."societyId"
   AND later."grantId"=c."grantId" AND later."ownershipVersion"=c."ownershipVersion" AND later."sequence">c."sequence") THEN
  RAISE EXCEPTION 'Approved license or current opt-in unavailable' USING ERRCODE='23514';
 END IF;
 IF aaraagate_v5454_used(a."id")>=p."maximumSocieties" THEN
  RAISE EXCEPTION 'Approved license capacity exhausted' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "SocietyLicenseAllocation_valid" BEFORE INSERT ON "SocietyLicenseAllocation" FOR EACH ROW EXECUTE FUNCTION aaraagate_v5454_allocation_check();
CREATE OR REPLACE FUNCTION aaraagate_reserved_draft_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PartnerLicenseCapacityReservation" WHERE "grantId"=OLD."id")
  OR EXISTS (SELECT 1 FROM "PartnerLicenseApproval" WHERE "grantId"=OLD."id")
  OR EXISTS (SELECT 1 FROM "SocietyLicenseConsent" WHERE "grantId"=OLD."id") THEN
  RAISE EXCEPTION 'Reserved license draft is immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PartnerLicenseApproval_immutable" BEFORE UPDATE OR DELETE ON "PartnerLicenseApproval" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "PartnerLicenseRevocation_immutable" BEFORE UPDATE OR DELETE ON "PartnerLicenseRevocation" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "SocietyLicenseConsent_immutable" BEFORE UPDATE OR DELETE ON "SocietyLicenseConsent" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "SocietyLicenseAllocation_immutable" BEFORE UPDATE OR DELETE ON "SocietyLicenseAllocation" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
COMMIT;
