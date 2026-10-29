# Visitor requests, passes and gate verification — 29 October 2026

H27-03/H27-08 continuation, Batch N. Source baseline: develop `5e408624d45ae474ca53c548bfc8d306f64dc7d3` (PR #1538). This batch converts the legacy Visitor/VisitorPass services and associated gate auditing; it does not complete AccessService, gate assignments, other operational domains or hosted policy activation.

## Behavior and boundaries

VisitorService request creation, pass creation, host listing, approval, denial and cancellation each use one withTenantContext transaction. Active/effective occupancy checks for creation, host/society ownership filters, conditional state transitions, random credentials and hashes, pass validity, response shapes and cancellation revocation remain. Host lists explicitly filter nested passes to the same society.

VisitorVerificationService verifies its active gate and same-society pass/visitor parent within the transaction. Verification auditing reuses that transaction through GateAuditService.record's optional internal client; standalone record/list calls establish their own context. Check-in/out retain compare-and-set writes and atomic visitor/pass/audit results. Check-out after credential expiry remains allowed for an already-entered visitor. No credential is written to audit evidence. Controllers, guards, permissions and public HTTP contracts are unchanged.

No RLS policies, grants, migrations or dependencies change. Enabling production policies still requires separate review of role ownership, all affected callers, parent integrity, worker exceptions and hosted acceptance. Transaction context alone does not enforce RLS. Added transactions/context-setting introduce overhead; no measured latency improvement is claimed.

## Validation and limitations

Before publication: 34 focused visitor/scope cases; 409 runnable risk cases (five Redis cases reserved for CI); API lint/typecheck, complexity boundaries, tracked-secret scan and all 44 stable domain invariants pass. New selected-module coverage: VisitorService 98.33% statements / 96.87% branches / 100% functions and lines; VisitorVerificationService and GateAuditService 100% across all four measures. New 90/85/100/90 floors are added without weakening existing floors. Selected coverage is not repository-wide coverage.

Six new restricted-role PostgreSQL cases cover both societies, full visitor/pass/audit lifecycle, foreign host/gate/unit/credential denial, effective occupancy, pass revocation, concurrent approval/check-in, audit/pass persistence rollback and malformed parent links. Copied Visitor/VisitorPass status enums use migrated labels and aligned local columns; checks/indexes are retained. Isolated copies omit public FK/trigger behavior. One new real migrated-table workflow tests issuance, audit joins and one-use entry/exit inside a rollback fixture. Database cases and full API regression must pass in protected CI before develop merge. Local database cases have not been executed; local package installation cannot supply a PostgreSQL server here.

Generated inventory: 287 tables, 455 runtime/script files, 221 migrations, 2,461 DB sites (1,714 raw / 747 ORM), 967 routes, 201 tenant-context calls, 13 indirect SQL sites and zero migration policy signals. Counts are static markers, not authorization proof. Both generated inventory outputs are synchronized.

## Change and deletion ledger

| Item | Decision | Risk and evidence |
| --- | --- | --- |
| Root visitor/pass/gate audit database calls | Refactor to existing tenant transaction helper | Medium; strict root-access rejection, behavioral tests and policy-enabled CI required |
| Parent/nested society predicates | Add explicit filters | Low; rejects malformed cross-society associations |
| Occupancy, credentials, validity and conditional transitions | Retain approved behavior | Existing and expanded lifecycle/negative/concurrency tests |
| Files, dependencies, migration history, public contracts | Retain; no complete file removal or upgrade | Reviewed diff and protected CI |

Remaining work includes AccessService request/invite/verify/mutations, gate access/assignment paths, other domains/jobs, hosted ownership/grants/policies, private storage, actual provider acceptance and device/field evidence. Overall health remains provisional 7.6; full definition of done is open.
