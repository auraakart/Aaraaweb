-- Bounded system-worker capabilities. Provision reviewed ownership and explicit
-- worker EXECUTE grants before deploying callers with a separate runtime role.
BEGIN;

CREATE FUNCTION public.aaraagate_claim_payment_gateway_operations()
RETURNS TABLE ("id" uuid, "societyId" uuid, "paymentId" uuid, "operationType" text,
  "provider" text, "providerOperationId" text, "amountPaise" bigint,
  "idempotencyKey" text, "attemptCount" integer)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  WITH due AS MATERIALIZED (
    SELECT o."id", o."societyId", COALESCE(o."nextAttemptAt",o."requestedAt") AS due_at, o."requestedAt"
    FROM public."PaymentGatewayOperation" o
    WHERE o."status" IN ('REQUESTED','UNKNOWN')
      AND (o."nextAttemptAt" IS NULL OR o."nextAttemptAt"<=CURRENT_TIMESTAMP)
    ORDER BY COALESCE(o."nextAttemptAt",o."requestedAt"),o."requestedAt",o."id"
    FOR UPDATE OF o SKIP LOCKED LIMIT 25
  ), claimed AS (
    UPDATE public."PaymentGatewayOperation" o
    SET "attemptCount"=o."attemptCount"+1, "lastAttemptAt"=CURRENT_TIMESTAMP,
      "nextAttemptAt"=CURRENT_TIMESTAMP+make_interval(secs=>LEAST(3600,60*power(2,LEAST(o."attemptCount",6))::integer)),
      "updatedAt"=CURRENT_TIMESTAMP
    FROM due WHERE o."id"=due."id" AND o."societyId"=due."societyId"
    RETURNING o."id",o."societyId",o."paymentId",o."operationType"::text,
      o."provider",o."providerOperationId",o."amountPaise",o."idempotencyKey",o."attemptCount"
  )
  SELECT c.* FROM claimed c JOIN due d ON d."id"=c."id" AND d."societyId"=c."societyId"
  ORDER BY d.due_at,d."requestedAt",d."id"
$function$;

CREATE FUNCTION public.aaraagate_claim_payment_reconciliation_cases(stale_seconds integer)
RETURNS TABLE ("id" uuid, "societyId" uuid, "paymentId" uuid, "provider" text)
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  WITH due AS MATERIALIZED (
    SELECT c."id",c."societyId",COALESCE(c."lastCheckedAt",c."createdAt") AS due_at,c."createdAt"
    FROM public."PaymentReconciliationCase" c
    WHERE stale_seconds>=60 AND c."status" IN ('PENDING','MISMATCH','ACTION_REQUIRED')
      AND (c."lastCheckedAt" IS NULL OR c."lastCheckedAt"<CURRENT_TIMESTAMP-make_interval(secs=>stale_seconds))
    ORDER BY COALESCE(c."lastCheckedAt",c."createdAt"),c."id"
    FOR UPDATE OF c SKIP LOCKED LIMIT 25
  ), claimed AS (
    UPDATE public."PaymentReconciliationCase" c
    SET "lastCheckedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
    FROM due WHERE c."id"=due."id" AND c."societyId"=due."societyId"
    RETURNING c."id",c."societyId",c."paymentId",c."provider"
  )
  SELECT c.* FROM claimed c JOIN due d ON d."id"=c."id" AND d."societyId"=c."societyId"
  ORDER BY d.due_at,d."id"
$function$;

REVOKE ALL ON FUNCTION public.aaraagate_claim_payment_gateway_operations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aaraagate_claim_payment_reconciliation_cases(integer) FROM PUBLIC;

COMMIT;
