-- Development DRAFT reservations only. Preserve the existing DRAFT-only grant CHECK.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TABLE "PartnerLicenseCapacityReservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "grantId" UUID NOT NULL REFERENCES "PartnerLicenseGrant"("id") ON DELETE RESTRICT,
  "planRevisionId" UUID NOT NULL REFERENCES "PartnerLicensePlanRevision"("id") ON DELETE RESTRICT,
  "grantVersion" INTEGER NOT NULL CHECK ("grantVersion">0),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
  "ownershipVersion" INTEGER NOT NULL CHECK ("ownershipVersion">0),
  "actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "idempotencyKey" UUID NOT NULL,
  "enabledFeatures" JSONB NOT NULL CHECK (jsonb_typeof("enabledFeatures")='array'),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PartnerLicenseCapacityReservation_grantId_idempotencyKey_key"
  ON "PartnerLicenseCapacityReservation"("grantId","idempotencyKey");
CREATE UNIQUE INDEX "PartnerLicenseCapacityReservation_grantId_societyId_ownershipVersion_key"
  ON "PartnerLicenseCapacityReservation"("grantId","societyId","ownershipVersion");
CREATE INDEX "PartnerLicenseCapacityReservation_societyId_ownershipVersion_idx"
  ON "PartnerLicenseCapacityReservation"("societyId","ownershipVersion");
CREATE TRIGGER "PartnerLicenseCapacityReservation_immutable" BEFORE UPDATE OR DELETE
  ON "PartnerLicenseCapacityReservation" FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE FUNCTION aaraagate_capacity_reservation_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE owner "Society"%ROWTYPE; license "PartnerLicenseGrant"%ROWTYPE; capacity INTEGER; used BIGINT;
BEGIN
  SELECT * INTO STRICT owner FROM "Society" WHERE "id"=NEW."societyId" FOR UPDATE;
  SELECT * INTO STRICT license FROM "PartnerLicenseGrant" WHERE "id"=NEW."grantId" FOR UPDATE;
  IF owner."status" <> 'ACTIVE' OR owner."partnerId" <> license."partnerId" OR owner."ownershipVersion" <> NEW."ownershipVersion"
     OR license."status" <> 'DRAFT' OR license."version" <> NEW."grantVersion" OR license."planRevisionId" <> NEW."planRevisionId"
     OR statement_timestamp() < license."startsAt" OR statement_timestamp() >= license."endsAt" THEN
    RAISE EXCEPTION 'Capacity reservation context changed' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM "Partner" WHERE "id"=license."partnerId" AND "status"='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive reservation partner' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "User" u JOIN "SocietyMembership" m ON m."userId"=u."id"
    WHERE u."id"=NEW."actorId" AND u."status"='ACTIVE' AND m."societyId"=NEW."societyId"
      AND m."active" AND m."role"='SUPER_ADMIN' FOR SHARE OF u,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation authority unavailable' USING ERRCODE='23514'; END IF;
  SELECT "maximumSocieties" INTO STRICT capacity FROM "PartnerLicensePlanRevision" WHERE "id"=NEW."planRevisionId";
  SELECT count(*) INTO used FROM "PartnerLicenseCapacityReservation" r JOIN "Society" s ON s."id"=r."societyId"
    WHERE r."grantId"=NEW."grantId" AND s."partnerId"=license."partnerId" AND s."ownershipVersion"=r."ownershipVersion";
  IF used >= capacity THEN RAISE EXCEPTION 'License capacity exhausted' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PartnerLicenseCapacityReservation_valid" BEFORE INSERT ON "PartnerLicenseCapacityReservation"
  FOR EACH ROW EXECUTE FUNCTION aaraagate_capacity_reservation_check();
-- A draft referenced by reservations must not silently change plan/period/version.
CREATE FUNCTION aaraagate_reserved_draft_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PartnerLicenseCapacityReservation" WHERE "grantId"=OLD."id") THEN
    RAISE EXCEPTION 'Reserved license draft is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PartnerLicenseGrant_reserved_draft" BEFORE UPDATE ON "PartnerLicenseGrant"
  FOR EACH ROW EXECUTE FUNCTION aaraagate_reserved_draft_check();
COMMIT;
