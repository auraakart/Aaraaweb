BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE "Session" ADD COLUMN "originHost" VARCHAR(253),
  ADD COLUMN "hostClaimId" UUID, ADD COLUMN "hostClaimVersion" INTEGER;
ALTER TABLE "Session" ADD CONSTRAINT "Session_host_claim_fkey"
  FOREIGN KEY ("hostClaimId") REFERENCES "PartnerDomainClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_host_binding_check" CHECK (
  ("originHost" IS NULL AND "hostClaimId" IS NULL AND "hostClaimVersion" IS NULL) OR
  ("audience"='PARTNER' AND "societyId" IS NULL AND "originHost" IS NOT NULL AND
   "hostClaimId" IS NOT NULL AND "hostClaimVersion" IS NOT NULL AND "hostClaimVersion">0)
);
CREATE INDEX "Session_hostClaimId_idx" ON "Session"("hostClaimId");
CREATE FUNCTION aaraagate_session_host_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."originHost" IS DISTINCT FROM OLD."originHost" OR
     NEW."hostClaimId" IS DISTINCT FROM OLD."hostClaimId" OR
     NEW."hostClaimVersion" IS DISTINCT FROM OLD."hostClaimVersion" THEN
    RAISE EXCEPTION 'Session host binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Session_host_binding_immutable" BEFORE UPDATE ON "Session"
FOR EACH ROW EXECUTE FUNCTION aaraagate_session_host_binding_immutable();
COMMIT;
