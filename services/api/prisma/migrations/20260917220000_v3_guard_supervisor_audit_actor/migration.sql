ALTER TABLE "GuardWatchlistEntry"
  ADD COLUMN "deactivatedByUserId" UUID,
  ADD COLUMN "deactivatedAt" TIMESTAMPTZ(6);

ALTER TABLE "GuardWatchlistEntry"
  ADD CONSTRAINT "GuardWatchlistEntry_deactivated_by_fkey"
  FOREIGN KEY ("deactivatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialGatePass"
  ADD COLUMN "cancelledByUserId" UUID,
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);

ALTER TABLE "MaterialGatePass"
  ADD CONSTRAINT "MaterialGatePass_cancelled_by_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
