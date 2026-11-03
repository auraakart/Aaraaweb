-- Exact credential-bound routing; no secret hash, name, meter or reading output.
-- A distinct application role needs reviewed explicit EXECUTE before deployment.
-- Provision a separate least-privilege owner before hosted RLS activation.
BEGIN;
CREATE FUNCTION public.aaraagate_resolve_utility_integration(integration_id uuid, supplied_hash text)
RETURNS TABLE ("id" uuid, "societyId" uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  SELECT i."id", i."societyId"
  FROM public."UtilityIntegration" i
  WHERE i."id"=integration_id AND i."secretHash"=supplied_hash
    AND i."status"='ACTIVE' AND supplied_hash ~ '^[0-9a-f]{64}$'
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.aaraagate_resolve_utility_integration(uuid,text) FROM PUBLIC;
COMMIT;
