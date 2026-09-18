# Aaraagate V4.3 — Competitor Migration and Society Onboarding

Date: 2026-09-18
Status: Implementation in progress
Baseline: V4.2-complete `develop`

## Goal
Reduce switching friction for societies moving from incumbent society-management products or spreadsheets without coupling Aaraagate to a competitor-specific export format.

## Implemented contracts

### Non-mutating preview
`POST /api/v1/migration/preview`

The preview endpoint is authenticated, tenant-scoped and protected by `SOCIETY_CONFIGURATION_MANAGE`. It validates canonical rows without writing target society data.

### Persisted dry-run batch
`POST /api/v1/migration/batches`

Dry-run batches persist actor/society ownership, deterministic SHA-256 checksum, normalized row evidence, duplicate/referential issues and READY/PREVIEWED state. Identical normalized data for one society is idempotent.

History/evidence:
- `GET /api/v1/migration/batches`
- `GET /api/v1/migration/batches/:id`

### Controlled structural commit
`POST /api/v1/migration/batches/:id/commit`

The first mutation-enabled slice deliberately supports only:
1. `BUILDING`
2. `UNIT`

A batch must be `READY`. Building rows require stable `name` and `code`; unit rows resolve a current-society building reference before insert. Every created target UUID and commit timestamp is recorded against the immutable source row. Commit is transaction-scoped and advisory-locked by batch id.

Operational commit is additionally enabled for `VEHICLE`, `WORKFORCE` and `VENDOR`. `RESIDENT`, `PARKING` and `OPENING_BALANCE` remain protected until their dedicated adapters are implemented.

### Controlled structural rollback
`POST /api/v1/migration/batches/:id/rollback`

Rollback is intentionally fail-closed:
- a migrated building cannot roll back while any unit exists beneath it;
- a migrated unit cannot roll back after ownership, occupancy, household, visitor, access-request, service-booking, helpdesk, SOS or maintenance data depends on it;
- rollback deletes only target UUIDs recorded by that migration batch;
- source evidence and target UUIDs remain recorded after rollback, with rollback actor/time added.

This creates a strict reverse dependency order: unit batches must roll back before their building batch.

## Supported dry-run entity types
- building;
- unit;
- resident / owner / tenant relationship input;
- vehicle;
- parking;
- workforce/staff;
- vendor;
- opening finance balance.

## Validation principles
- Headers normalize to lower snake-style keys.
- Common aliases such as `flat_number`, `mobile`, `vehicle_number` and `ledger_code` are accepted.
- Batches are bounded to 10,000 rows per entity.
- Required-field, invalid-value and duplicate failures are row-scoped.
- Opening-balance amounts use integer paise.
- References resolve only inside the authenticated society.
- Ambiguous bare unit numbers fail closed; `BUILDING_CODE/UNIT_NUMBER` disambiguates.
- Opening-balance account codes must exist in the active-society chart of accounts.
- Existing operational identities are reported as conflicts before commit.

## Generic mapping strategy
Aaraagate uses a canonical migration schema rather than competitor-specific write code. MyGate, NoBrokerHood, ADDA, ApnaComplex or spreadsheet exports should map into the same canonical fields.

## Persisted evidence model
`MigrationBatch` records society, actor, lifecycle, checksum, validation counts and commit/rollback actors/timestamps. `MigrationBatchRow` records normalized source, identity, issues, target type/UUID, committed time and rolled-back time.

These tables are migration evidence, not a parallel operational store.

## Planned V4.3 sequence
1. Preview/normalization/duplicate validation. **Complete**
2. Referential validation/source mapping. **Complete**
3. Persisted dry-run/checksum/audit evidence. **Complete**
4. Dependency-ordered commit engine. **Structural BUILDING/UNIT slice implemented**
5. Rollback/undo boundary. **Structural BUILDING/UNIT slice implemented**
6. Resident/vehicle/parking/workforce/vendor domain-safe commit adapters. **VEHICLE/WORKFORCE/VENDOR implemented; RESIDENT/PARKING pending**
7. Opening-balance handoff into the V4.1 idempotent cutover contract and reconciliation summary.
8. Admin onboarding checklist/progress surface.
9. Migration evidence export.
10. Large-import, invalid-data, duplicate, rollback and cross-society isolation regression evidence.

## Safety invariants
- Every request resolves an authenticated society tenant.
- Plain preview never writes data.
- Persisted preview writes migration evidence only.
- A commit cannot run from PREVIEWED/invalid state.
- No commit bypasses society ownership or database/domain constraints.
- Rollback is blocked after downstream operational dependencies appear.
- Vehicle commit requires an already-existing household for the referenced unit; migration never creates an untracked household as a side effect.\n- Workforce rollback is blocked once assignments/ratings/suspension evidence exists.\n- Vendor rollback is blocked once procurement records reference the migrated vendor.\n- Financial cutover will reuse V4.1 opening-balance logic rather than create a second balance store.
- Cross-society references fail closed.
- Migration evidence is never silently destroyed.

## Remaining V4.3 acceptance work
V4.3 remains open until non-structural domain adapters, V4.1 finance cutover/reconciliation, Admin onboarding/progress, evidence export and large-import/isolation regression evidence are complete.
