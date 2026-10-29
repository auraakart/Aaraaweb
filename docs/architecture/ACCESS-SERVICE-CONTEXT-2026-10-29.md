# Access requests and gate mutation tenant context — 29 October 2026

Batch O, H27-03/H27-08 continuation. Baseline develop `dced952a6c94cbc96165b97be85efd567c03c329` (PR #1539). This source slice covers AccessService; gate assignments/access guards, other domains/jobs and hosted isolation remain separate work.

## Changes and preserved behavior

All AccessService database operations now use the selected society's transaction client. Creation, invite/recovery, resident and destination listings, walk-ins, status, decisions, verification, entry and exit include their authorization/entitlement reads in that scope. EntitlementService receives the same client through its existing optional argument; its implementation and client contracts do not change.

The four entry/exit endpoints share the existing private gate mutation implementation, now accepting an internal ID or hash lookup. Gate authorization, originating-gate binding, request lookup, existing receipt, validity/feature checks, conditional status update, new receipt, audit and response share a transaction. A mutation error rolls back before a fresh tenant transaction checks for a competing committed receipt. Authorization, lookup and key-binding failures cannot enter recovery. Redundant root pre-reads are consolidated. No raw credential is persisted in metadata/audit.

Preserved: current/effective occupancy, unexpired gate delegation, notification versus approval authority, nonresident-owner denial, private resident request decisions, invite fingerprint/key namespace, advisory lock, credential rotation, one-use status changes, receipt request/gate/action binding, exit after expiry/feature disablement and public HTTP signatures/responses. Nested occupancy destination filters now explicitly require the same society; response lookups keep society predicates. Controllers and assignment guards remain in force.

No table/policy/grant/migration/dependency changes or complete file removals. Context is preparation for enforcement, not production RLS activation. Added transaction/context-setting overhead has not been benchmarked; no latency improvement claimed.

## Validation

Before publication: 448 runnable risk cases pass (five Redis cases require CI), API lint/typecheck, SQL parameter contracts, complexity boundaries, tracked-secret scan and all 44 stable domain invariants. AccessService selected coverage is 92.95% statements / 88.05% branches / 100% functions and lines. Floors increase from 50/40/60/55 to 85/75/100/90; other floors are retained. Tests are not repository-wide coverage.

Existing fixtures now supply explicit tenant callbacks and preserve all authority/state assertions. New strict-root tests cover every public operation, real entitlement reads, fresh-client rollback/recovery ordering and failure without bypassing gate/key checks. Six new restricted-role cases cover both societies, credential rotation, entry/exit/replay, gate origin, notification/delegation authority, foreign substitutions/malformed occupancy parents, concurrent same-key invites and gate retries, actual PostgreSQL-aborted audit rollback and expiry/disabled-feature behavior. GateMutationReceipt is copied with migrated defaults/checks/indexes. AccessRequest subject/status and receipt action use local enums cloned from migrated labels with matching copied column types. Copies omit public FK/trigger behavior; one new real migrated workflow exercises walk-in approval, entry/exit receipts and invite recovery. Database/full regression acceptance remains pending protected CI; no local PostgreSQL acceptance claimed.

Static inventory: 287 tables, 455 runtime/script files, 221 migrations, 2,457 access sites (1,714 raw / 743 ORM), 967 routes, 213 context calls, 13 indirect SQL sites, zero migration policy signals. Four duplicate lookup sites were consolidated, not four features removed. Both generated outputs are synchronized. Counts are markers, not authorization proof.

## Decision and deletion ledger

| Item | Decision | Risk / validation |
| --- | --- | --- |
| Root AccessService reads and transactions | Refactor through existing context helper | Medium; strict-root, behavioral and restricted-role/migrated CI |
| Four duplicated mutation pre-read blocks | Consolidate in existing mutation helper | Medium; gate binding, idempotency/recovery and lifecycle regressions |
| Private helper parameters and nested society filters | Add explicit client and society scope | Low; typecheck, malformed-parent denial |
| Features, guards, APIs, files, dependencies and migration history | Retain | No complete file/dependency removal or upgrade |

Remaining: hosted role ownership/grants/policies, gate assignment/access paths, other operational domains/jobs, private storage, actual provider and independent device/field acceptance. Overall health remains provisional 7.6; the full definition of done is open.

CI correction: initial run 40866758104 passed clean migrations, typecheck/lint and all 20 migrated workflows plus the previous 53 restricted-role cases; six new cases exposed isolated AccessRequest enum-column/parameter mismatches. Replaced the subject/status/action domains with cloned local enums and aligned only the copied columns, preserving defaults/indexes/constraints and all assertions. Production code and policies are unchanged by the correction; the complete restricted-role suite must pass before acceptance.
