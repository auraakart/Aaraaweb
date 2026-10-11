# V5.0.2 tenant-access inventory and V5.2 work queue

Version: 1.7, 2026-10-11. Current review baseline: develop `12d861fe02d6b056ceab415ed86822d0e8ac7ec9`, with the V5.2.7 community-circle transaction changes included in the generated register. Original ownership inventory baseline: `8e87dbf8f809215db92e14dfd727c42ac7f76553`. This completes the source-access inventory deliverable. Authorization hardening remains V5.2 work; this register is not an isolation certification.

## Coverage and reproduction

Run `node services/api/scripts/tenant-access-inventory.mjs --write` after API source/schema/migration changes, review the register diff, then run with `--check`. Canonical API CI fails on stale output. Use the repository's Node 22/pnpm 10.15 toolchain; no new service or dependency is required.

The companion `v5-tenant-access-inventory.json` contains every discovered table, ordered migration origins, schema/DDL fields, candidate authority boundary, access modules, review owner and disposition. Each access entry includes its file/line, enclosing function, database receiver, ORM/raw operation, referenced tables, query/enclosing scope signals and nested relation signals. Each controller route records decorators and scope evidence. The deterministic digest binds this register to the exact scanned source content.

| Coverage | Count |
| --- | ---: |
| Tables, including SQL-only tables | 249 |
| API runtime/script source files | 397 |
| Migration SQL files | 190 |
| Database access sites | 2,122 |
| Raw SQL / ORM sites | 1,607 / 515 |
| Controller route handlers | 872 |
| Unsafe runtime SQL calls discovered | 0 |
| Unsafe disposable performance-seed calls | 11 |
| Recognized SQL utility sites | 59 |
| Indirect SQL expression requiring manual resolution | 1 |
| Runtime calls to `withTenantContext` | 63 |
| RLS enable/force/policy statements in migrations | 0 |

Scope token presence is a review aid, not proof of a predicate, current membership, or same-tenant parent relationship. AST extraction targets known Prisma model delegates, including literal bracket access, and raw query/execute calls. It resolves local SQL variables to a bounded depth. DDL extraction targets this repository's quoted table declarations and ALTER-added fields. Unknown SQL forms, computed delegates, imported SQL construction, nested authorization, external database clients, hosted roles/grants/policies and actual runtime reachability require separate review. Tests/generated code are excluded. Searches outside API source/scripts found source-contract checks rather than runtime Prisma access; browser/mobile API calls are downstream surfaces, not database access sites.

The one unresolved AST SQL expression is `HelpdeskSlaService.evaluate` → `helpdeskSlaStateForSnapshotSql` in `helpdesk-sla-state.ts`. Manual review finds a parameterized CASE expression over a ticket already selected under both ticketId and societyId with FOR UPDATE. It introduces no additional table lookup. Retain the generated unresolved marker so changes to the helper remain visible; V5.2 must still verify the surrounding authorization path.

## Authority boundaries

| Boundary | Authority to establish in V5.2 | Review owner |
| --- | --- | --- |
| Society root and direct societyId rows | Authenticated active society membership, required permission and server-selected context; hybrid nullable society rows need explicit branch semantics | Owning API module maintainer |
| Poll option/response children | Join option/response → poll → society; validate referenced option belongs to that poll | Governance maintainer |
| Migration row/artifact children | Join row → batch and artifact → row → batch → society; verify rollback artifacts within the same batch | Migration maintainer |
| Service warranty / provider booking proposal | Booking → society or independent-home location, plus actor/provider relationship; proposal is private operational data | Marketplace maintainer |
| User and Session | Identity lifecycle and self/platform authority; Session's optional society context never makes the identity catalogue public | Authentication maintainer |
| Consumer/provider relationship tables | Consumer self, provider operator/agent mapping, location ownership and purpose-specific platform privileges; a shared catalogue does not make payments, tokens or settlements public | Marketplace maintainer |
| Provider onboarding | Applicant ownership, verified provider mapping and explicit platform review rights | Marketplace maintainer |
| Shared provider catalogue and private administration | Public approved catalogue projections separated from operator edits, media evidence, review notes, trust/commercial administration and audit history | Marketplace maintainer |
| Partner and PartnerMembership | Verified commercial membership or explicit platform permission; no inherited society operational grant | Principal Architect and authentication maintainer |
| Entitlement compatibility | Society-linked internal cutover evidence; platform reconciliation access only; never a public configuration payload | Entitlements maintainer |

Every table has a boundary and maintainer responsibility in the JSON register; no table remains in the generic global/parent review bucket. Module names identify the maintainers' scope rather than inventing individual staff assignments. The three zero-direct-access tables are the newly added Partner, PartnerMembership and SocietyEntitlementCompatibility, written by this migration only. Their runtime readers/writers require V5.2 checks before introduction.

## Prioritized conversion batches

| Task | Priority | Modules/access paths | Required closure evidence |
| --- | --- | --- | --- |
| ISO-01 | P0 | auth, Prisma, societies, entitlements, new partner tables; all 872 routes | Audience/role matrix; partner-only membership cannot read society data; server-derived context; revoked membership rejection; explicit audited platform access |
| ISO-02 | P0 | accounting, billing, payments/webhooks, settlements, exports, migration | Cross-society/partner read/write negatives, reference ownership, idempotency namespace and concurrency; preserve historical invoices and effective features |
| ISO-03 | P0 | scheduled-work, notifications, realtime, object-storage cleanup, privacy, AI; callbacks and sweeps | Global enumeration produces narrowly scoped jobs; revalidate current ownership at execution; scoped storage URLs, delivery channels and caches; revocation/transfer/replay tests |
| ISO-04 | P0 | governance child rows, migration artifacts, marketplace proposals/warranty, nested ORM connects/includes/creates | Parent/child consistency and orphan scan; composite-FK or equivalent transactional validation; independent-home and provider mapping negatives |
| ISO-05 | P0 | access/gate, parcels, household/workforce, helpdesk/SOS, amenities, facilities/utilities | Legacy workflow regression, tenant context passed through transaction client, pooled connection reuse/rollback negatives |
| ISO-06 | P0 | all scoped table batches; runtime DB role/RLS policies | Explicit table-by-table policy matrix, applicable bypass-role audit, USING/WITH CHECK and missing-context negatives; no blanket RLS activation before conversion |
| ISO-07 | P1 | disposable performance-seed.mjs (11 Unsafe calls), SQL utility/advisory locks | Fixture-only execution safeguards, no runtime promotion, controlled identifier construction and trigger restoration; lock keys appropriate to society/user/provider scope |

The `withTenantContext` helper sets a transaction-local database value. Fifty-four runtime calls now cover branding configuration, society details, gate assignments, community-poll participation, community events, the resident directory, community circles core committee/meeting workflows and governance document/poll artifacts. No migrated RLS policies exist yet, so current service/guard predicates remain the protection mechanism. Preserve them throughout conversion. Global scheduler and platform operations require narrowly authorized exceptions rather than forcing every table to carry partnerId. Never copy partnerId onto all operational rows; derive current ownership through Society.

Definition of Done for this inventory: exhaustive static register for the supported repository source forms; table/route/query evidence and authority classes; explicit exceptions/limitations; maintainer responsibilities; prioritized V5.2 conversion queue; deterministic stale check in canonical CI. Definition of Done for isolation is separate: runtime-role, pooled-connection, nested-write, worker, storage/cache and cross-audience tests tied to each converted batch. Changes to source or DDL forms require extractor review as well as regeneration.

## Protected validation closure

Implemented and merged through [PR #1210](https://github.com/auraakart/Aaraaweb/pull/1210). Runtime head f2a28dda4c5c2531d3ac2c95be62341010b0b2a3 passed [canonical CI](https://github.com/auraakart/Aaraaweb/actions/runs/38132938204); develop merge 2ee24a4ab6f302e0d767df3c31f18229883baf91. Native PostgreSQL 16 clean deployment, historical upgrade, 64 compatibility fixtures, replay, atomic failure rollback, constraints and legacy society response checks passed. API/Admin/Flutter full suites and required merge gates passed. The test harness uses explicit PostgreSQL connection fields and Node adapter tests live with the repository's Node tests. The tenant-index checker recognizes society-leading primary keys without requiring duplicate indexes, with non-leading/commented-key regression coverage. Staging/main and hosted environments remain untouched.


## V5.2.4 bounded conversion

PR #1214 passed canonical CI run 38142779328 at head `1b988d8ea4b732a4a2c605bb418f7ef8b256cd1a` and merged into develop as `360537eaf2d3ffd167a4c597826b30c87bef0203`. The automatic merge job only operates on `mastermind/*` branches; this feature branch required the authorized explicit merge after all protected checks passed.

Community-poll listing, closed results, responses and status changes now use the transaction client supplied by `withTenantContext`. Parent poll authorization and option-to-poll checks stay in the same transaction; vote and lifecycle row locks are retained. Unit tests reject global-client fallback and exercise response contracts, inaccessible polls, foreign options and duplicate votes. The disposable PostgreSQL fixture checks both societies, owner-only versus community audiences, concurrent duplicate attempts, closed results, foreign status rejection and revoked occupancy. Canonical API CI executes this fixture via the existing full test suite. Native PostgreSQL validation remains required before merging this slice.

No policy, migration, permission or entitlement is changed by V5.2.4. This closes one parent-derived access path in ISO-04, not the full governance module or V5.2. Roll back via a reviewed revert of the slice if compatibility checks fail; preserve all SQL society/audience predicates and previous merged foundations. Staging/main promotion remains excluded.


## V5.2.5 bounded conversion

PR #1215 passed canonical CI run 38145620048 at head `62465f42a19c8c9ef745afb2f5d2d4c82769318a` and merged into develop as `a92428210ceddba03aef0aecd51ede1b25b08619`.

Community event resident/admin listing, creation, lifecycle and RSVP operations now establish tenant context and use the supplied transaction client throughout. Explicit society/audience predicates, event/RSVP row locks, capacity enforcement and existing responses are retained. The PostgreSQL fixture tests both societies, owner/occupant visibility, inaccessible lifecycle/RSVP operations, concurrent last-place booking, unchanged RSVP retry, revoked occupancy and cancelled lifecycle. It runs in the existing canonical API full suite; native database and protected CI validation remain required before this slice merges.

Five event operations add five runtime context calls, for fifteen total. No migration or RLS policy is added. Community circles, directory and other governance paths remain in the conversion queue; this slice does not close ISO-04 or V5.2. Staging/main promotion remains excluded.


## V5.2.6 bounded conversion

Seven resident-directory operations now use society-scoped transactions. Owner/occupant checks, self-profile identity lookup and contact recipient/pending-pair validation stay on the supplied client. The opt-in projection, private participant-only contact history and consent transition predicates are preserved. Unit tests cover revoked residents and global-client fallback; the disposable PostgreSQL fixture covers foreign societies, hidden recipients, reciprocal pending-request concurrency, consent actor restrictions, repeat responses, withdrawals and revoked occupancy. Native database validation remains required in canonical CI.

Runtime context calls increase from fifteen to twenty-two; this does not enable RLS or close the remaining governance conversion queue. Staging/main remain excluded.


## V5.2.6 synchronization recovery

V5.2.5 merged through PR #1216 at `a276ae344ebc0e51a0a75afe6313b2b38a494e5b`. V5.2.6 canonical CI run 38154135594 passed all required validation gates, including full API and native PostgreSQL, on `0b6e2307be5f23ea87c93da431fbc888ea6685d6`; only the auto-merge step failed because develop advanced during validation. This recovery preserves both slices and refreshes the branch base. Protected checks must pass on the synchronized head before merge. Subsequent slices start only after the preceding develop merge is verified, avoiding stacked generated-register conflicts. Staging/main remain untouched.


## V5.2.7 community-circle tenant transactions

V5.2.6 merged through PR #1217 at `12d861fe02d6b056ceab415ed86822d0e8ac7ec9` after canonical CI run [38155971108](https://github.com/auraakart/Aaraaweb/actions/runs/38155971108) passed on synchronized head `db72cfc4b1ab9a05341f54e5cfbce5708c575d1e`, including native PostgreSQL and all required merge gates. The stale-base failure is closed.

Fifteen community-circle operations now establish tenant context. Resident authority, membership, parent lookup, sender identity, messages, requests, review, lifecycle, expiry updates and moderation use only the supplied transaction client. Helper clients are mandatory; resident requests share their existing transaction with name locking and insertion. SQL society/parent predicates, row/advisory locks, opt-in membership, sender snapshots, approval-only publication, latest-100 chronological history, hidden messages and idempotent join/leave behavior remain intact. Controller permissions and feature gates are unchanged.

The scheduled `deleteExpired` method remains a documented bounded platform exception (100 rows, FOR UPDATE SKIP LOCKED); it is not a resident API. Scheduler authorization/context conversion remains ISO-03 work. Unit tests reject global-client access, revoked residency and foreign parents. A disposable PostgreSQL fixture exercises two societies, duplicate-name races, membership privacy, foreign messages/moderation, report deduplication, request approval, closed/expired lifecycle, join/leave retries and revoked residency. Canonical API CI must execute the fixture before merge.

Local circle/controller/scheduler validation passed 43 tests. API lint/typecheck/build, inventory regeneration, API route/PostgreSQL parameter contracts, V4.82 circle trust contract, branding and secret scan passed. The optional V4.86 adoption script has a pre-existing stale Easy Mode source-token assertion in unchanged apps/resident/lib/main.dart; it is not a changed-slice validation failure. Native PostgreSQL remains required in protected CI. Runtime context calls increase from 22 to 37. This bounded conversion does not enable RLS, close ISO-04/ISO-03 or certify complete V5 isolation. Rollback is a reviewed revert. Staging/main promotion remains excluded.


## V5.2.8 governance core transactions and evidence atomicity

V5.2.7 merged through PR #1218 at `2d2dd11d1c844a4d793ef24284668c63a0585d82` after canonical CI run [38156639668](https://github.com/auraakart/Aaraaweb/actions/runs/38156639668) passed on `c10c14fb4bfd1b439a1f5a71023c50ecd01cc938`. Full API regression passed 1,706 tests (15 explicitly skipped); the new community-circle PostgreSQL fixture executed successfully. All required merge gates passed.

Eleven committee/meeting operations now establish society-scoped transactions. Parent and linked agenda/resolution checks, mutation, append-only evidence and meeting aggregate reads use the same supplied client. Public meeting reads delegate to a client-required internal helper, avoiding nested transactions during mutation response reads. Meeting creation/outcomes, agenda, resolutions and action creation now roll back when evidence fails; action updates retain existing atomicity and row locking. Committee tenure creation adds a society/member advisory lock before its overlap query so concurrent first-tenure requests cannot both pass an empty history. Existing response fields, date/quorum/status checks, identity lookup rules, controller permissions, feature entitlements and SQL scope predicates remain unchanged.

Unit tests reject global-client fallbacks, foreign parents and linked children, and propagate evidence failure. A disposable PostgreSQL fixture covers two societies, same-society foreign meetings, first-tenure races, lifecycle/evidence consistency and six failed-evidence rollbacks. It also proves evidence deletion remains forbidden. Fixture cleanup temporarily disables only its append-only delete trigger under a table lock within transactional DDL, deletes only generated society fixtures, and restores the trigger before commit; this is test-only and never a runtime path.

Local focused governance validation: 35 tests passed; native PostgreSQL fixture skipped without DATABASE_URL and must execute in canonical CI before merge. API lint/typecheck/build, inventory regeneration and API/PostgreSQL parameter, repository, branding and secret contracts passed. Runtime context calls increase from 37 to 48. No schema/RLS, partner audience or client contract changes. Remaining governance artifact/election controllers and other isolation batches remain open; this is not complete V5 isolation. Rollback is a reviewed revert. Staging/main promotion remains excluded.


## V5.2.9 governance document and poll artifact transactions

V5.2.8 merged through PR #1219 at `5c73fab6d3b242676687c0fea7d3251872ab39ca` after canonical CI run [38158624597](https://github.com/auraakart/Aaraaweb/actions/runs/38158624597) passed on `d03ef1bc69f40459baf7132433648698e025d0ec`. Full API regression passed 1,736 tests (15 explicitly skipped). The native governance fixture passed its cross-society/meeting negatives, first-tenure race, evidence immutability and six rollback paths.

Six governance artifact operations now establish society context. Document parent and linked-resolution checks, reads, insertion/verification and append-only evidence use the supplied transaction client. Poll parent validation moves inside the transaction that inserts the poll and its options. All helper clients are mandatory. Existing permissions, poll entitlements, nonstatutory-only rules, DTO/normalization behavior, response fields and explicit society/meeting predicates remain intact. Failed document evidence now rolls back insertion/verification; poll option failures retain full rollback.

Twenty transaction tests cover global-client fallbacks, foreign parents, linked resolutions, evidence failures, later option failure and actor/input validation. A disposable PostgreSQL fixture covers two societies, same-society foreign meetings/resolutions, document verification races and retries, failed-evidence rollback, and a real downstream option-length constraint rollback. Fixture-only cleanup restores the append-only delete trigger using transactional DDL/table locking and touches only generated society IDs. Canonical CI must execute the database fixture before merge.

Local artifact/controller/permission validation: 27 tests passed. API lint/typecheck/build, deterministic inventory and API/PostgreSQL parameter, repository, branding and secret checks passed. Native PostgreSQL remains required in protected CI. Runtime context calls increase from 48 to 54. No schema/RLS or partner audience changes. Community audience/detail reads, election/privacy/readiness controllers and other isolation batches remain open; this does not certify complete V5 isolation. Rollback is a reviewed revert. Staging/main promotion remains excluded.


## V5.2.10 existing community governance conversion

Four existing community handlers use the tenant context. The visibility check and authoritative meeting aggregate share the supplied client, with a shared meeting row lock through detail assembly. Audience mutation and audit retain their atomic transaction and now establish society context. Existing owner/occupant and parent audience filters remain intact. Runtime context calls increase from 54 to 58; no database policy or new product flow is introduced. Native PostgreSQL and protected CI remain required before merge.


## V5.2.11 existing election foundation conversion

Five existing policy and electorate handlers use society context, preserving society locks, immutable snapshots, eligibility predicates, separation of duties and response fields. Parent and member reads share a supplied client; no nested/global fallback remains in these handlers. Runtime context calls increase from 58 to 63. Native PostgreSQL and protected CI remain required before merge.
