# Aaraagate V4.27 — Society Onboarding and Migration Closure

Date: 2026-09-20  
Status: Repository closure candidate for `develop`  
External acceptance: Excluded from repository closure

## Scope closed

V4.27 reuses the V4.3 canonical migration engine and adds operator-facing staging, direct XLSX intake, consolidated onboarding guidance and deterministic closure evidence.

Implemented repository capabilities:

1. CSV paste/upload and direct XLSX first-worksheet staging.
2. Existing non-mutating `POST /api/v1/migration/preview` remains the validation boundary.
3. Existing persisted dry-run batches remain deterministic and idempotent.
4. Row-level schema, duplicate/conflict and referential validation remain server-authoritative.
5. Existing dependency-aware commit/rollback and opening-balance reconciliation remain authoritative.
6. Migration history, row evidence and export remain available through the Migration Center.
7. Society onboarding workspace coordinates Property, Migration, People & Roles, Integrations, Amenities, Finance and Governance without introducing a duplicate configuration store.
8. Representative migration evidence spans BUILDING, UNIT, RESIDENT, VEHICLE, PARKING, WORKFORCE, VENDOR and OPENING_BALANCE.

## XLSX boundary

The Admin migration stager accepts `.xlsx` files and reads the first worksheet locally in the browser. It maps worksheet values into the same canonical row objects used by CSV before calling the existing migration preview API.

Safety controls:
- 10 MB staging cap;
- 10,000 data-row limit;
- malformed ZIP/XML rejection;
- unsupported compression rejection;
- empty/duplicate header rejection;
- invalid shared-string reference rejection;
- source worksheet row numbers retained as `__source_row`;
- no third-party XLSX dependency;
- no direct operational mutation from spreadsheet parsing.

## Deterministic representative fixture

Fixture:
`apps/admin/scripts/fixtures/v4.27-representative-migration.json`

Covered canonical entities:
- BUILDING
- UNIT
- RESIDENT
- VEHICLE
- PARKING
- WORKFORCE
- VENDOR
- OPENING_BALANCE

Stable canonical SHA-256:
`4ec05ed9f9ae7ed7f2b76cd68e49fdac8417231eec2be6973b4e2d616633c9ac`

The Admin regression `v4.27-onboarding-readiness-evidence-regression.mjs` fails if entity coverage, source-row evidence, checksum or onboarding authority boundaries change unexpectedly.

## Onboarding configuration authority

The onboarding workspace is orchestration only.

Authoritative configuration remains in:
- Property Setup — building/floor/unit structure;
- Migration Center — preview, dry-run, commit, rollback and evidence;
- People & Roles — operational memberships/responsibilities;
- Integration Readiness / Access Integrations — provider identity and gate/access readiness;
- Amenities — inventory and booking-policy configuration;
- Finance — accounting/tax/reconciliation/payment readiness under finance permissions;
- Governance — committee, quorum, approval and bye-law references;
- Entitlements — feature availability.

This preserves segregation of duties and prevents configuration drift.

## Exit-gate assessment

Representative migration fixture deterministic: **repository evidence present**.

Invalid rows never partially corrupt published state: **covered by existing preview/READY gating, transaction-scoped commits and V4.3 regression contracts**.

Imported privileged relationships auditable: **covered by migration batch/row evidence and created/reused artifact tracking**.

## External boundaries

Repository closure does not imply:
- hosted infrastructure readiness;
- live SMS/WhatsApp/payment/provider credentials;
- commercial provider certification;
- physical ANPR/RFID/boom-barrier validation;
- real-society migration rehearsal or operator acceptance;
- jurisdiction-specific policy/legal acceptance;
- production promotion to `main`.

Those remain V4.28 / release-program acceptance work.
