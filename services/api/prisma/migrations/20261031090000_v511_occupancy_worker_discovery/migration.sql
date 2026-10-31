-- Bounded discovery only. Completion retains its existing tenant transaction,
-- request lock and conditional transition; this does not introduce a lease.
-- A reviewed non-owner capability owner and explicit worker EXECUTE grant are
-- deployment prerequisites, provisioned separately from this additive migration.
BEGIN;

CREATE FUNCTION public.aaraagate_due_occupancy_lifecycle(batch_limit integer)
RETURNS TABLE ("id" uuid, "societyId" uuid, "reviewedByUserId" uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  SELECT r."id",r."societyId",r."reviewedByUserId"
  FROM public."OccupancyLifecycleRequest" r
  JOIN public."Unit" u ON u."id"=r."unitId" AND u."societyId"=r."societyId"
  JOIN public."Building" b ON b."id"=u."buildingId" AND b."societyId"=r."societyId"
  WHERE batch_limit BETWEEN 1 AND 50 AND r."status"='APPROVED'
    AND r."effectiveAt"<=CURRENT_TIMESTAMP
  ORDER BY r."effectiveAt",r."id"
  LIMIT GREATEST(0,LEAST(batch_limit,50))
$function$;

REVOKE ALL ON FUNCTION public.aaraagate_due_occupancy_lifecycle(integer) FROM PUBLIC;

COMMIT;
