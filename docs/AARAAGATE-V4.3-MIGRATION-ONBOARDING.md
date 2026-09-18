# Aaraagate V4.3 — Competitor Migration and Society Onboarding

Date: 2026-09-18
Status: Foundation implementation in progress
Baseline: V4.2-complete `develop`

## Goal
Reduce switching friction for societies moving from incumbent society-management products or spreadsheets without coupling Aaraagate to a competitor-specific export format.

## Foundation contract

The first V4.3 slice provides a non-mutating, society-scoped migration preview contract at:

`POST /api/v1/migration/preview`

The endpoint is protected by authentication, tenant resolution and `SOCIETY_CONFIGURATION_MANAGE`. It accepts normalized row objects after CSV/Excel parsing and returns validation/duplicate evidence before any database write is allowed.

Supported entity types in the foundation:
- building;
- unit;
- resident / owner / tenant relationship input;
- vehicle;
- parking;
- workforce/staff;
- vendor;
- opening finance balance.

## Normalization and validation principles
- Input headers are normalized to lower snake-style keys.
- Common source aliases such as `flat_number`, `mobile`, `vehicle_number` and `ledger_code` are accepted by the preview validator.
- Preview is bounded to 10,000 rows per entity batch.
- Required-field failures are row-scoped.
- Invalid enum/value formats are row-scoped.
- Duplicate identities are detected within a preview batch.
- Opening-balance amounts use integer paise, consistent with the V4.1 accounting invariant.
- Preview never mutates society data.

## Generic mapping strategy
Aaraagate deliberately uses a canonical migration schema rather than MyGate-, NoBrokerHood-, ADDA- or ApnaComplex-specific service code. Source-specific export differences should be handled by a mapping layer into the canonical fields. This keeps migration behavior testable and makes spreadsheet onboarding use the same path.

## Planned V4.3 sequence
1. Preview/normalization/duplicate-validation foundation.
2. Cross-entity referential validation and source-column mapping definitions.
3. Persisted migration batch with dry-run status, checksums and audit evidence.
4. Commit engine ordered by dependencies.
5. Rollback/undo strategy for a migration batch that has not crossed a protected operational boundary.
6. Opening-balance handoff into the V4.1 idempotent cutover contract and reconciliation summary.
7. Admin onboarding checklist/progress surface.
8. Migration evidence export.
9. Large-import, invalid-data, duplicate, rollback and cross-society isolation tests.

## Safety invariants
- Every migration request must resolve an authenticated society tenant.
- No preview can write data.
- No migration commit may bypass normal domain constraints or tenant ownership checks.
- Financial cutover must reuse the authoritative accounting/opening-balance contract rather than create a parallel balance store.
- Import batches require deterministic identities/checksums before commit and rollback are introduced.
- Cross-society references fail closed.
- Migration history is auditable; destructive silent replacement is prohibited.

## Current foundation exit criteria
This first slice is ready to merge when:
- preview endpoint is authenticated, tenant-scoped and permission-protected;
- all eight initial entity schemas are previewable;
- normalization, required-field validation and duplicate detection have unit tests;
- opening-balance preview enforces integer-paise and debit/credit format;
- API lint/typecheck/tests/build/readiness remain green;
- existing Admin, Resident, Guard, security and pilot-contract checks remain green.

This foundation does not by itself complete V4.3. Persisted batch state, referential validation, commit/rollback, reconciliation, Admin onboarding and evidence export remain subsequent V4.3 slices.
