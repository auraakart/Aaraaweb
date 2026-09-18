# Aaraagate V4.3 — Competitor Migration and Society Onboarding

Date: 2026-09-18
Status: Implementation in progress
Baseline: V4.2-complete `develop`

## Goal
Reduce switching friction for societies moving from incumbent society-management products or spreadsheets without coupling Aaraagate to a competitor-specific export format.

## Implemented contracts

### Non-mutating preview
`POST /api/v1/migration/preview`

The preview endpoint is authenticated, tenant-scoped and protected by `SOCIETY_CONFIGURATION_MANAGE`. It accepts normalized row objects after CSV/Excel parsing and returns validation and in-batch duplicate evidence without writing target society data.

### Persisted dry-run batch
`POST /api/v1/migration/batches`

The persisted-batch slice keeps the target business domains read-only. It stores:
- actor and society ownership;
- canonical entity type and optional source label;
- deterministic SHA-256 checksum;
- normalized immutable row evidence;
- duplicate and referential validation issues;
- READY/PREVIEWED dry-run state;
- society-scoped history through `GET /api/v1/migration/batches` and `GET /api/v1/migration/batches/:id`.

An identical normalized batch for the same society is idempotent through the society/checksum unique key.

## Supported entity types
- building;
- unit;
- resident / owner / tenant relationship input;
- vehicle;
- parking;
- workforce/staff;
- vendor;
- opening finance balance.

## Normalization and validation principles
- Input headers normalize to lower snake-style keys.
- Common source aliases such as `flat_number`, `mobile`, `vehicle_number` and `ledger_code` are accepted.
- Preview is bounded to 10,000 rows per entity batch.
- Required-field, invalid-value and duplicate failures are row-scoped.
- Opening-balance amounts use integer paise, consistent with V4.1 accounting.
- Building references are validated against the active society.
- Unit references resolve only inside the active society. Ambiguous bare unit numbers fail closed; `BUILDING_CODE/UNIT_NUMBER` disambiguates them.
- Opening-balance account codes must exist in the active society chart of accounts.
- Existing vehicles, workforce identities, vendors, buildings and units are surfaced as conflicts before any commit capability exists.
- Cross-society references cannot resolve because every reference snapshot is loaded by the authenticated tenant.

## Generic mapping strategy
Aaraagate deliberately uses a canonical migration schema rather than MyGate-, NoBrokerHood-, ADDA- or ApnaComplex-specific service code. Source-specific export differences map into canonical fields, so spreadsheet onboarding and competitor exports use one validation path.

## Persisted evidence model
`MigrationBatch` records the society, actor, lifecycle state, checksum and validation counts. `MigrationBatchRow` records each normalized row, deterministic identity and row-specific issues. These tables are migration evidence, not a parallel operational data store.

The persisted batch does **not** create buildings, units, residents, vehicles, staff, vendors, parking assignments or finance balances. That separation prevents a dry-run from becoming an accidental partial migration.

## Planned V4.3 sequence
1. Preview/normalization/duplicate-validation foundation. **Complete**
2. Cross-entity referential validation and source-column mapping definitions. **Implemented in persisted batch slice**
3. Persisted migration batch with dry-run status, checksums and audit evidence. **Implemented in persisted batch slice**
4. Commit engine ordered by dependencies.
5. Rollback/undo strategy for a migration batch that has not crossed a protected operational boundary.
6. Opening-balance handoff into the V4.1 idempotent cutover contract and reconciliation summary.
7. Admin onboarding checklist/progress surface.
8. Migration evidence export.
9. Large-import, invalid-data, duplicate, rollback and cross-society isolation tests.

## Safety invariants
- Every migration request resolves an authenticated society tenant.
- Plain preview never writes data.
- Persisted preview writes migration evidence only, never target business records.
- No migration commit may bypass normal domain constraints or tenant ownership checks.
- Financial cutover must reuse the authoritative V4.1 opening-balance contract rather than create a parallel balance store.
- Import batches have deterministic checksums before commit and rollback are introduced.
- Cross-society references fail closed.
- Migration history is auditable; destructive silent replacement is prohibited.

## Remaining V4.3 acceptance work
V4.3 is not complete until controlled commit/rollback, V4.1 opening-balance handoff/reconciliation, Admin onboarding/progress, evidence export and large-import/isolation regression evidence are green.
