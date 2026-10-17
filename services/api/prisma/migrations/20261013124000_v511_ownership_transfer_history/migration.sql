-- Additive two-person ownership transfer history. Live entitlements unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TABLE "SocietyOwnershipTransferRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
  "fromPartnerId" UUID NOT NULL REFERENCES "Partner"("id") ON DELETE RESTRICT,
  "toPartnerId" UUID NOT NULL REFERENCES "Partner"("id") ON DELETE RESTRICT,
  "expectedOwnershipVersion" INTEGER NOT NULL CHECK ("expectedOwnershipVersion" > 0 AND "expectedOwnershipVersion" < 2147483647),
  "initiatedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "idempotencyKey" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("fromPartnerId" <> "toPartnerId")
);
CREATE UNIQUE INDEX "SocietyOwnershipTransferRequest_societyId_idempotencyKey_key"
  ON "SocietyOwnershipTransferRequest"("societyId", "idempotencyKey");
CREATE INDEX "SocietyOwnershipTransferRequest_societyId_createdAt_idx"
  ON "SocietyOwnershipTransferRequest"("societyId", "createdAt");
CREATE TABLE "SocietyOwnershipTransfer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "requestId" UUID NOT NULL REFERENCES "SocietyOwnershipTransferRequest"("id") ON DELETE RESTRICT,
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE RESTRICT,
  "ownershipVersion" INTEGER NOT NULL CHECK ("ownershipVersion" > 1),
  "approvedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SocietyOwnershipTransfer_requestId_key" ON "SocietyOwnershipTransfer"("requestId");
CREATE UNIQUE INDEX "SocietyOwnershipTransfer_societyId_ownershipVersion_key"
  ON "SocietyOwnershipTransfer"("societyId", "ownershipVersion");
CREATE FUNCTION aaraagate_ownership_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ownership proposals and approvals are immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER "SocietyOwnershipTransferRequest_immutable" BEFORE UPDATE OR DELETE
  ON "SocietyOwnershipTransferRequest" FOR EACH ROW EXECUTE FUNCTION aaraagate_ownership_append_only();
CREATE TRIGGER "SocietyOwnershipTransfer_immutable" BEFORE UPDATE OR DELETE
  ON "SocietyOwnershipTransfer" FOR EACH ROW EXECUTE FUNCTION aaraagate_ownership_append_only();
-- A forged receipt cannot claim another society/version or self-approval.
CREATE FUNCTION aaraagate_ownership_receipt_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE proposal "SocietyOwnershipTransferRequest"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT proposal FROM "SocietyOwnershipTransferRequest" WHERE "id"=NEW."requestId";
  IF proposal."societyId" <> NEW."societyId" OR proposal."expectedOwnershipVersion" + 1 <> NEW."ownershipVersion"
     OR proposal."initiatedById" = NEW."approvedById" THEN
    RAISE EXCEPTION 'Invalid ownership approval' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM "Society" WHERE "id"=NEW."societyId" AND "status"='ACTIVE'
    AND "partnerId"=proposal."fromPartnerId" AND "ownershipVersion"=proposal."expectedOwnershipVersion" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ownership source changed' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "User" u JOIN "SocietyMembership" m ON m."userId"=u."id"
    WHERE u."id"=proposal."initiatedById" AND u."status"='ACTIVE'
      AND m."societyId"=NEW."societyId" AND m."active" AND m."role"='SUPER_ADMIN' FOR SHARE OF u,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive ownership initiator' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "User" u JOIN "SocietyMembership" m ON m."userId"=u."id"
    WHERE u."id"=NEW."approvedById" AND u."status"='ACTIVE'
      AND m."societyId"=NEW."societyId" AND m."active" AND m."role"='SUPER_ADMIN' FOR SHARE OF u,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive ownership approver' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "Partner" WHERE "id"=proposal."fromPartnerId" AND "status"='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive ownership source' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "Partner" WHERE "id"=proposal."toPartnerId" AND "status"='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive ownership destination' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SocietyOwnershipTransfer_valid" BEFORE INSERT ON "SocietyOwnershipTransfer"
  FOR EACH ROW EXECUTE FUNCTION aaraagate_ownership_receipt_check();
-- The old owner and next version must have an exact immutable approval.
CREATE FUNCTION aaraagate_ownership_write_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."partnerId" IS DISTINCT FROM OLD."partnerId" OR NEW."ownershipVersion" IS DISTINCT FROM OLD."ownershipVersion" THEN
    IF NEW."ownershipVersion" <> OLD."ownershipVersion" + 1 OR NOT EXISTS (
      SELECT 1 FROM "SocietyOwnershipTransfer" t JOIN "SocietyOwnershipTransferRequest" r ON r."id"=t."requestId"
      WHERE t."societyId"=OLD."id" AND t."ownershipVersion"=NEW."ownershipVersion"
      AND r."fromPartnerId"=OLD."partnerId" AND r."toPartnerId"=NEW."partnerId"
      AND r."expectedOwnershipVersion"=OLD."ownershipVersion"
    ) THEN
      RAISE EXCEPTION 'Audited ownership approval required' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Society_audited_ownership" BEFORE UPDATE OF "partnerId", "ownershipVersion"
  ON "Society" FOR EACH ROW EXECUTE FUNCTION aaraagate_ownership_write_check();
-- An approval cannot be committed unless the matching owner/version was applied.
CREATE FUNCTION aaraagate_ownership_applied_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Society" s JOIN "SocietyOwnershipTransferRequest" r ON r."id"=NEW."requestId"
    WHERE s."id"=NEW."societyId" AND s."ownershipVersion"=NEW."ownershipVersion" AND s."partnerId"=r."toPartnerId") THEN
    RAISE EXCEPTION 'Ownership approval and change must commit together' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "SocietyOwnershipTransfer_applied" AFTER INSERT ON "SocietyOwnershipTransfer"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION aaraagate_ownership_applied_check();
COMMIT;
