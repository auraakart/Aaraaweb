-- Exact signed-callback routing capability. No invoice, payer or amount data.
-- A distinct runtime role requires an explicit EXECUTE grant before deployment.
-- Provision/review a dedicated least-privilege function owner before RLS activation.
BEGIN;

CREATE FUNCTION public.aaraagate_resolve_payment_webhook_order(order_id text)
RETURNS TABLE ("id" uuid, "societyId" uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  SELECT p."id", p."societyId"
  FROM public."Payment" p
  WHERE p."providerOrderId" = order_id AND p."provider" = 'gateway-adapter'
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.aaraagate_resolve_payment_webhook_order(text) FROM PUBLIC;

COMMIT;
