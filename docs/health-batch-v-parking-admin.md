# Parking admin tenant context — 31 October 2026

Baseline develop df23ace60f32b8e92e3fc8cd0309a05df3c2e091 (PR #1546).

ParkingAdminController.list now runs through the existing tenant transaction helper, retaining selection, ordering, JSON label interpretation and response fields. Explicit household/unit/building society predicates and active vehicle society filtering protect nested relations. HouseholdService.updateVehicleParkingSlot uses the same tenant transaction for household lookup, active vehicle eligibility and preference write. Its household row lock precedes the JSON read, matching the existing preference writer and serializing competing label updates. Trimming, clearing a label, unrelated preference keys, existing error messages, route guards and permissions remain intact.

The private label helper accepts a transaction client; vehicle deactivation still uses its original root client and remains separate follow-up work. Other HouseholdService operations are not converted in this slice. No migration, hosted policy/grant, endpoint, permission, dependency or schema change.

Evidence: strict root-rejection tests cover both paths, list scope/fields/legacy malformed JSON, write normalization/removal/preservation, missing household/vehicle and transaction errors. Restricted non-owner FORCE RLS acceptance adds both-society list/update isolation, foreign/inactive substitutions, malformed parent exclusion and synchronized competing-label regression. Copied tables retain checks/indexes but omit public FKs/triggers. A separate migrated workflow exercises real household relations and eligibility. Database results require protected CI; no local PostgreSQL acceptance is claimed.

Local focused tests: 32 passed. Risk selection: 589 passed / five Redis skips, retained floors passed. API lint/typecheck and repository secret/complexity checks passed. Required protected CI and explicit develop merge remain pending until recorded in the durable checkpoint. Test counts overlap; they are not additive unique coverage. No full Admin/Flutter/device, performance or hosted RLS acceptance claimed. Main/staging remain unchanged; overall health provisional 7.6.
