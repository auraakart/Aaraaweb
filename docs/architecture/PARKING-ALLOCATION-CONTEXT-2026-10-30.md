# Parking allocation tenant context — 30 October 2026

Batch T; baseline develop `db0808c4f2e925fdcea4339f44542838869690a1` (PR #1544). [PR #1545](https://github.com/auraakart/Aaraaweb/pull/1545).

ParkingService list/createSlot/allocate/release/history now use per-operation tenant clients. Building selection is explicitly checked within the tenant before slot insertion, complementing the retained public scope guard. Existing same-society building/allocation/household/unit/vehicle joins, input normalization/limits, response shapes, slot ordering, 500-event history limit, slot row lock, policy defaults, credential checks, partial unique constraints, active-only release and atomic parking events are retained. No migration, permission, endpoint, dependency, production grant or policy activation.

## Demonstrated corrections

Initial candidate `948af75c8fb79eabf493ccdbb810371caec6a796`, CI `41005665740` / API job `123900050991`, passed the public migrated workflow group (29 cases) but failed two of 80 restricted-role cases:

- A real duplicate slot code raised PrismaClientKnownRequestError instead of ConflictException. The old mapper recognized only top-level PostgreSQL code 23505. It now also recognizes Prisma P2010 with meta.code 23505 and retains all unrelated errors.
- Two transactions allocating different slots/vehicles to one household both succeeded under a limit of one. The count-before-insert test synchronizes competing counts, with a bounded release for serialized callers. Vehicle/household lookup now locks the selected same-society Household row before reading policy/count. Existing slot lock and unique indexes remain; subsequent statements observe committed allocations under normal READ COMMITTED transactions.

The household lock serializes this service's allocations per household, including distinct slots and vehicles. It does not impose a database-wide cap on arbitrary SQL, serialize concurrent policy changes, or claim a bound under every isolation level/caller. Direct policy edits and other parking operations remain separate acceptance work. Added lock contention has not been benchmarked.

## Evidence and change ledger

Strict root-rejection tests exercise all five operations, context absence, validation/normalization, building denial, policy/default/credential branches, safe error mapping and event failures. Six non-owner FORCE RLS cases exercise both societies, foreign/inactive substitutions, credential provenance, household limits/reuse, real duplicate slot/vehicle indexes, cross-slot household concurrency and rollback after actual event writes. LIKE copies preserve migrated checks/indexes but omit public FKs/triggers. HouseholdVehicle's copied VehicleType labels and column match the migrated native enum.

One public migrated workflow proves actual slot/allocation scope guards, release after slot/vehicle deactivation, active-only release and append-only event protection. SAVEPOINTs recover intentionally rejected statements; the outer fixture rolls back immutable evidence without disabling triggers. Batch S permit lifecycle regressions remain enabled.

| Change | Purpose / risk |
| --- | --- |
| Root reads/write transactions → existing tenant helper | Remove selected context gaps; no new hosted RLS policy |
| Explicit building lookup | Deny foreign/missing building before insertion, consistent with database scope rule |
| Household row lock | Correct demonstrated cross-slot household-limit race; possible added contention |
| Narrow Prisma duplicate mapping | Return intended safe 409 conflicts for actual database uniqueness errors |
| Tests, selected risk floor, generated inventory | Verify isolated and public behavior; preserve all existing floors |
| Historical migrations, files, constraints and dependencies | Retained; no complete file removal |

Static inventory: 287 tables, 455 runtime/script sources, 222 migrations, 2,458 DB sites (1,715 raw / 743 ORM), 967 routes, 226 context calls, 13 unresolved SQL sites and zero migration policy signals. Counts are not authorization evidence. Final protected PostgreSQL/API/risk validation and every required merge gate must pass before explicit develop merge; no local PostgreSQL acceptance is claimed. Final candidate/run/tree/merge evidence is recorded in the PR and durable health checkpoint.

Remaining: ParkingOperationsService policy/credential/violation paths, other domains/jobs, hosted role ownership/grants/policies, private storage and real provider/device/field evidence. Main/staging unchanged; H27-03/H27-08 partial, H27-04 open, health provisional 7.6.
