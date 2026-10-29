# Restricted-role gate assignment acceptance — 29 October 2026

Batch Q, H27-03/H27-08 continuation. Baseline develop `65931047378c55da43dbe4a219542ad823d3f10c` (PR #1541). GateAssignmentService already uses tenant clients; this slice adds actual policy-enabled acceptance and fixes one demonstrated date-validation defect, without reimplementing assignment storage or authority.

## Demonstrated defect and correction

The existing service checked assignment end versus start only when effectiveFrom was explicitly supplied. A new focused regression failed on the baseline: assign(..., undefined, new Date(0)) resolved successfully instead of rejecting. The service now computes the actual default start once and validates effectiveTo against that value before membership lookup or insertion. Explicit valid/historical windows remain supported; invalid windows retain the existing BadRequest message. Guard use already rejects expired windows, so this is an invalid-data acceptance defect, not evidence of unauthorized gate entry.

All other runtime behavior remains: same-society active security membership at assignment time, guard/supervisor roles, same-society gate checks, inclusive start/exclusive end, active gate requirement on assertion, partial-index active upsert, deactivation history, replacement after deactivation and transaction-local scope. Assertion itself retains existing membership semantics; controller/auth membership guards are unchanged. No HTTP/DTO/permission/migration/policy/grant/dependency changes or complete file removal.

## Validation and limits

Before publication: 476 runnable risk cases passed (five Redis cases reserved for CI), API lint/typecheck, SQL parameter contracts, complexity, tracked-secret scan and all 44 domain invariants. GateAssignmentService selected coverage is 100% across statements/branches/functions/lines; new floors 90/85/100/90 retain all existing thresholds. The baseline regression failed 1/12 focused cases, then passed in the selected risk suite after the narrow fix. Selected-module coverage is not repository-wide assurance.

Six new restricted-role cases exercise the actual service under a non-owner NOBYPASSRLS runtime role with FORCE RLS on isolated migrated table copies. They cover both-society guard/supervisor assignment and upsert/deactivation history; exact windows and inactive gates; owner/accountant/inactive/foreign membership rejection; foreign gate/assignment IDs and malformed parent joins; concurrent active retries with the real partial unique index; and rollback after executed upsert/deactivation writes followed by response failure. The fixture copies SocietyMembership and GateGuardAssignment INCLUDING ALL, preserving migrated defaults/checks/indexes, and clones migrated MembershipRole labels with a matching copied role column for Prisma IN filters. Cleanup is limited to random fixture memberships/gates and parameterized UUID casts. Public FKs/triggers are not reproduced by LIKE copies. The existing real migrated assignment lifecycle now additionally rejects the default-start/past-end defect; complete full API/database CI is still required before merge. No local PostgreSQL execution is claimed.

Static runtime inventory is regenerated with its human summary; no routes, tables or database access sites added. Context markers remain preparation, not enforcement. No performance improvement or hosted isolation acceptance claimed.

## Decision and deletion ledger

| Item | Decision | Risk / validation |
| --- | --- | --- |
| Default-start end-date check | Correct demonstrated missing validation | Low; failed baseline regression, positive/negative windows and migrated acceptance |
| Existing tenant helpers, security role checks, partial upsert, deactivation/history | Retain | Real restricted-role concurrency/lifecycle/rollback and prior migrated test |
| Isolated membership/assignment copies and enum alignment | Add acceptance evidence | Medium fixture risk; complete dedicated suite must pass |
| Files, APIs, dependencies, migrations and production policies | Retain | No complete file removal, upgrade, grant or policy activation |

Remaining: hosted ownership/grants/policies, other domains/jobs and parent-derived/private storage enforcement, actual provider acceptance and independent device/field evidence. Overall health remains provisional 7.6; full definition of done is open.
