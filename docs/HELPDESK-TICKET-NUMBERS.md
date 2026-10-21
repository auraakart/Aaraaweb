# Permanent helpdesk ticket numbers

Residents and administrators see the same permanent reference, for example `HD-2026-000123`, in complaint lists and details. Both detail views offer copying. Admin Helpdesk search and the shared role-scoped search accept the reference.

The database allocates references for every insert, including older API clients. Existing tickets are backfilled using their UTC creation year without replacing UUIDs, changing timestamps or rewriting activities. A global PostgreSQL sequence supplies a minimum six-digit suffix, increasing beyond six digits when necessary; it does not reset annually. Gaps are expected after rolled-back inserts, so numbers are references rather than a ticket-count measure. UUID routes and all existing society/property permission checks remain authoritative.

Exact submission retries return the original record and reference. Resolution, closure and reopening preserve it; a database trigger rejects number changes. The unique constraint prevents reuse. Apply `pnpm --filter @aaraagate/api prisma:migrate:deploy` before deploying the application. Back up the database normally, including its sequence state. The atomic migration locks the ticket table while backfilling; schedule the deployment appropriately for database size. It is additive for older clients; rolling application code back does not require removing numbers.

Validation includes PostgreSQL upgrade/backfill, concurrent allocation, immutability and suffix expansion tests; API replay/reopen and scoped-search tests; Resident display/copy widgets; and Admin display/copy/search browser coverage. Physical device acceptance remains separate from automated checks.
