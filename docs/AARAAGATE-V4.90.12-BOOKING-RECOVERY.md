# Aaraagate V4.90.12 — Service booking recovery after appointment start

**Base:** `develop` a0877e13bc7d5e095fa79da6226ba692e806887f. Prepared after V4.90.10; gate PR V4.90.11 must finish and this feature branch must be reconciled against latest `develop` before opening the next PR.

## Root cause
`ConsumerBookingsService.createBooking` checked whether the requested slot started in the past before checking the user's existing same-key booking. A legitimate replay after a server-side success and lost network response could therefore fail solely because the appointment time had passed. That conflicts with the existing consumer repeat-booking retry safety objective.

## Change
Keep schedule ordering validation, precise user/location/offering/notes fingerprint, per-user advisory locking and the authoritative booking engine. A fresh no-key booking is still rejected immediately when its slot has passed. For keyed requests, check the stored same-key booking first and return it **only if the entire payload matches**; if no matching booking exists, still reject a historical start before resolving location, pricing, capacity or inserting. All service pricing and booking snapshots remain immutable and server-owned.

## Regression evidence and boundaries
Add cases for exact historical retry recovery, unknown historical booking rejection, and changed payload denial. Required exact-head API/CI and PostgreSQL regression gates must pass before `develop` merge. This does not introduce quotation approval, payment collection, live provider confirmation, automatic recurrent booking, or any production integration. Staging/main untouched.
