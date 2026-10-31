-- A reviewed non-owner function owner and explicit worker EXECUTE are deployment
-- prerequisites, following the existing V5 capability rollout. No RLS activation.
BEGIN;
CREATE FUNCTION public.aaraagate_due_amenity_deposits(batch_limit integer)
RETURNS TABLE ("id" uuid, "societyId" uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $function$
  SELECT b."id",b."societyId"
  FROM public."AmenityBooking" b
  JOIN public."Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
  JOIN public."Unit" u ON u."id"=b."unitId" AND u."societyId"=b."societyId"
  JOIN public."Building" parent ON parent."id"=u."buildingId" AND parent."societyId"=b."societyId"
  WHERE batch_limit BETWEEN 1 AND 200
    AND b."status"='CONFIRMED' AND b."depositStatus"='PAYMENT_REQUIRED'
    AND b."depositPaise">0 AND b."depositDueAt"<=CURRENT_TIMESTAMP
  ORDER BY b."depositDueAt",b."id"
  LIMIT GREATEST(0,LEAST(batch_limit,200))
$function$;
REVOKE ALL ON FUNCTION public.aaraagate_due_amenity_deposits(integer) FROM PUBLIC;
COMMIT;
