-- Explicit system-worker capabilities; hosted ownership/EXECUTE grants and
-- reviewed worker policies must be provisioned separately before runtime use.
BEGIN;

CREATE FUNCTION public.aaraagate_claim_accounting_export(lease_seconds integer)
RETURNS TABLE ("id" uuid, "societyId" uuid, "format" text, "fromDate" date, "toDate" date)
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  WITH candidate AS MATERIALIZED (
    SELECT j."id",j."societyId",j."createdAt"
    FROM public."AccountingExportJob" j
    WHERE lease_seconds>=60 AND (j."status"='QUEUED' OR (j."status"='PROCESSING' AND j."leaseUntil"<CURRENT_TIMESTAMP))
    ORDER BY j."createdAt",j."id" FOR UPDATE OF j SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public."AccountingExportJob" j
    SET "status"='PROCESSING',"attemptCount"=j."attemptCount"+1,"lastAttemptAt"=CURRENT_TIMESTAMP,
      "leaseUntil"=CURRENT_TIMESTAMP+make_interval(secs=>lease_seconds),"errorCode"=NULL
    FROM candidate c WHERE j."id"=c."id" AND j."societyId"=c."societyId"
    RETURNING j."id",j."societyId",j."format"::text,j."fromDate",j."toDate"
  ) SELECT * FROM claimed
$function$;

CREATE FUNCTION public.aaraagate_seed_accounting_deliveries(target_provider text)
RETURNS bigint
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  WITH inserted AS (
    INSERT INTO public."AccountingConnectorDelivery" ("societyId","exportJobId","provider","idempotencyKey")
    SELECT j."societyId",j."id",target_provider,('accounting-export:'||j."id"::text||':'||target_provider)
    FROM public."AccountingExportJob" j
    JOIN public."AccountingExportArtifact" a ON a."jobId"=j."id" AND a."societyId"=j."societyId"
    WHERE j."status"='COMPLETED'
    ON CONFLICT ("societyId","exportJobId","provider") DO NOTHING
    RETURNING 1
  ) SELECT COUNT(*) FROM inserted
$function$;

CREATE FUNCTION public.aaraagate_claim_accounting_deliveries(lease_seconds integer)
RETURNS TABLE ("id" uuid, "societyId" uuid, "exportJobId" uuid, "provider" text, "idempotencyKey" text, "attemptCount" integer)
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  WITH due AS MATERIALIZED (
    SELECT d."id",d."societyId",COALESCE(d."nextAttemptAt",d."createdAt") AS due_at,d."createdAt"
    FROM public."AccountingConnectorDelivery" d
    WHERE lease_seconds>=60 AND (
      (d."status" IN ('QUEUED','ACCEPTED','UNKNOWN') AND (d."nextAttemptAt" IS NULL OR d."nextAttemptAt"<=CURRENT_TIMESTAMP))
      OR (d."status"='PROCESSING' AND d."leaseUntil"<CURRENT_TIMESTAMP))
    ORDER BY COALESCE(d."nextAttemptAt",d."createdAt"),d."createdAt",d."id"
    FOR UPDATE OF d SKIP LOCKED LIMIT 20
  ), claimed AS (
    UPDATE public."AccountingConnectorDelivery" d
    SET "status"='PROCESSING',"attemptCount"=d."attemptCount"+1,"lastAttemptAt"=CURRENT_TIMESTAMP,
      "leaseUntil"=CURRENT_TIMESTAMP+make_interval(secs=>lease_seconds),"updatedAt"=CURRENT_TIMESTAMP
    FROM due WHERE d."id"=due."id" AND d."societyId"=due."societyId"
    RETURNING d."id",d."societyId",d."exportJobId",d."provider"::text,d."idempotencyKey"::text,d."attemptCount"
  ) SELECT c.* FROM claimed c JOIN due d ON d."id"=c."id" AND d."societyId"=c."societyId"
    ORDER BY d.due_at,d."createdAt",d."id"
$function$;

REVOKE ALL ON FUNCTION public.aaraagate_claim_accounting_export(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aaraagate_seed_accounting_deliveries(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aaraagate_claim_accounting_deliveries(integer) FROM PUBLIC;

COMMIT;
