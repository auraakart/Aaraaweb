# V5.0.2 tenant-access inventory and V5.2 work queue

Version: 1.1, 2026-10-11. Review baseline: develop `8e87dbf8f809215db92e14dfd727c42ac7f76553`, with the V5.1.0 additive ownership changes included in the generated register. This completes the source-access inventory deliverable. Authorization hardening remains V5.2 work; this register is not an isolation certification.

## Coverage and reproduction

Run `node services/api/scripts/tenant-access-inventory.mjs --write` after API source/schema/migration changes, review the register diff, then run with `--check`. Canonical API CI fails on stale output. Use the repository's Node 22/pnpm 10.15 toolchain; no new service or dependency is required.

The companion `v5-tenant-access-inventory.json` contains every discovered table, ordered migration origins, schema/DDL fields, candidate authority boundary, access modules, review owner and disposition. Each access entry includes its file/line, enclosing function, database receiver, ORM/raw operation, referenced tables, query/enclosing scope signals and nested relation signals. Each controller route records decorators and scope evidence. The deterministic digest binds this register to the exact scanned source content.

| Coverage | Count |
| --- | ---: |
| Tables, including SQL-only tables | 249 |
| API runtime/script source files | 397 |
| Migration SQL files | 190 |
| Database access sites | 2,123 |
| Raw SQL / ORM sites | 1,606 / 517 |
| Controller route handlers | 872 |
| Unsafe runtime SQL calls discovered | 0 |
| Unsafe disposable performance-seed calls | 11 |
| Recognized SQL utility sites | 58 |
| Indirect SQL expression requiring manual resolution | 1 |
| Runtime calls to `withTenantContext` | 0 |
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

The existing `withTenantContext` helper sets a transaction-local database value, but this snapshot contains no runtime calls or migrated RLS policies. Consequently, current service/guard predicates remain the protection mechanism. Preserve them throughout conversion. Global scheduler and platform operations require narrowly authorized exceptions rather than forcing every table to carry partnerId. Never copy partnerId onto all operational rows; derive current ownership through Society.

Definition of Done for this inventory: exhaustive static register for the supported repository source forms; table/route/query evidence and authority classes; explicit exceptions/limitations; maintainer responsibilities; prioritized V5.2 conversion queue; deterministic stale check in canonical CI. Definition of Done for isolation is separate: runtime-role, pooled-connection, nested-write, worker, storage/cache and cross-audience tests tied to each converted batch. Changes to source or DDL forms require extractor review as well as regeneration.

## Protected validation closure

Implemented and merged through [PR #1210](https://github.com/auraakart/Aaraaweb/pull/1210). Runtime head f2a28dda4c5c2531d3ac2c95be62341010b0b2a3 passed [canonical CI](https://github.com/auraakart/Aaraaweb/actions/runs/38132938204); develop merge 2ee24a4ab6f302e0d767df3c31f18229883baf91. Native PostgreSQL 16 clean deployment, historical upgrade, 64 compatibility fixtures, replay, atomic failure rollback, constraints and legacy society response checks passed. API/Admin/Flutter full suites and required merge gates passed. The test harness uses explicit PostgreSQL connection fields and Node adapter tests live with the repository's Node tests. The tenant-index checker recognizes society-leading primary keys without requiring duplicate indexes, with non-leading/commented-key regression coverage. Staging/main and hosted environments remain untouched.
