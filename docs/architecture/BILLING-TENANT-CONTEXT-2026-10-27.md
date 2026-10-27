# Billing tenant-context conversion — 27 October 2026

Backlog: H27-03 (partial), H27-08 (risk coverage). Baseline develop: `df564da82ad477f04af013bbf3ec59a5f2f6f296`. Target: protected develop integration only.

## Changes and cause

Payment checkout and resident activity statements already applied society and current relationship predicates, but opened transactions without the database tenant setting. Enabling policies on those tables would therefore reject otherwise valid requests from a non-owner runtime role. The context helper also had no way to preserve the statement's explicit repeatable-read transaction options.

- Maintenance and amenity-deposit checkout now use `withTenantContext(societyId, transactionClient => ...)` for every domain query/write.
- The redundant maintenance-invoice authorization pre-read is consolidated into the existing identical authorization predicate on the locked invoice query. Unauthorized callers still receive `Invoice not found`, before payment/idempotency queries; owner/current tenant eligibility and effective dates remain unchanged.
- Statements use tenant context and retain repeatable-read isolation, India calendar boundaries, export caps and payer-private evidence.
- `withTenantContext` forwards optional isolation/timeout settings to Prisma without changing existing callers' defaults. Failure to establish context prevents domain work.
- Risk coverage now includes statement behavior and a per-file floor; existing floors are unchanged. Tenant access inventories are regenerated together.

There are no schema migrations, production RLS activation, permission, API response, theme, entitlement or notification-routing changes. No files or dependencies are removed.

## Isolated database acceptance

`billing-tenant-context.postgres.spec.ts` runs only with `GITHUB_ACTIONS=true`, `AARAAGATE_BILLING_RLS_CI=1` and the exact localhost disposable `aaraagate_ci` database. CI invokes it explicitly before the broad regression suite. It creates a UUID-named schema and a distinct LOGIN role with no superuser/RLS-bypass/ownership rights. It uses copies of the actual migrated table definitions, grants rights only on those copies and enables/forces society policies there. Application tables and production role grants are untouched. Teardown closes clients and drops the test schema and role.

The nine cases check:

1. Actual non-owner identity, no superuser or BYPASSRLS.
2. Context-free reads and writes denied by RLS.
3. Owner and current tenant checkout through the converted service.
4. Amenity deposit owner/payer/society binding and exact snapshotted amount.
5. Same retry key in separate societies and foreign invoice substitution.
6. Revoked ownership despite valid selected tenant context.
7. Wrong-society INSERT/UPDATE/DELETE and attempted tenant reassignment.
8. Payer-private statement export, foreign property denial and pooled context clearing.
9. Concurrent society separation, rollback clearing on pooled connections and repeatable-read forwarding.

`LIKE ... INCLUDING ALL` copies types/defaults/indexes/check constraints, not foreign keys or triggers. This fixture tests policy/context behavior, not the entire production constraint/trigger graph. Existing clean migration, payment integrity, owner/tenant and finance concurrency suites remain required against the actual migrated public schema. This test does not certify all operational records, policy expressions, parent-derived tables, callbacks or jobs.

## Deletion ledger

| Item | Reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Separate preliminary invoice authorization SELECT and its guard | CONSOLIDATE duplicated check into the retained authorization query under invoice lock and tenant context | Both predicates bind invoice/society/user, verified active ownership or active TENANT occupancy, and effective dates; retained query executes before payment lookup/write; no route, migration, flag, offline or dynamic symbol depends on the removed anonymous query block | Medium: security-sensitive boundary | Foreign/revoked scope, owner/current tenant, duplicate keys, owner/tenant concurrency, migrated PostgreSQL and non-owner RLS regressions |
| Files/dependencies | RETAIN | No complete deletion evidence | No removal | Diff contains no deleted paths |

## Risk and impact

Authentication/RBAC remains the caller boundary; a society setting alone does not confer ownership or payer eligibility. Locked checkout predicates and server-side amounts remain authoritative. Query consolidation removes one duplicated authorization read while tenant setup adds a setting query. Amenity checkout and statements gain one setting query per transaction. No measured latency gain is claimed.

Regression risk is medium because payment and statement transactions change. Rollback can restore these code changes before policy activation; it must not disable database policies as an automatic response. Hosted runtime-role grants, production policy activation and independent review remain open under #212.

## Remaining H27-03 scope

This closes only the checkout/statement transaction-client conversion and its isolated-policy test surface. Billing reads, invoice issue/notifications, AutoPay preference paths, signed callback global order resolution, receipt persistence/replay/processing/failure evidence, reconciliation and scoped jobs need their own conversion and semantic acceptance. Parent-derived records, identity/global exceptions and private object access remain in the wider rollout. Do not mark H27-03 or issue #212 complete from this slice.

## Validation checkpoint

Focused checkout/statement/context/request-integrity tests: 54 passed. Expanded risk suite: 202 passed / 5 dedicated Redis tests skipped locally without the disposable Redis URL; all configured floors passed. API lint/typecheck passed before broader validation. Non-owner RLS execution, full regression and protected merge evidence are recorded after candidate CI; no local policy-enabled PostgreSQL result is implied here.

Broader local checkpoint: API lint/typecheck/build passed; full API suite 2,448 passed / 151 skipped (database and dedicated Redis prerequisites, including nine new isolated RLS cases). The 44 stable domain invariants, hotspot budgets, PostgreSQL parameter contracts and synchronized inventory checks passed. No live database policy/role is changed locally. Protected CI must execute the dedicated nine-case RLS fixture and the existing migrated public-schema workflows before integration.

Fixture DDL uses the repository's existing Prisma SQL-runner process pattern. The repository-wide prohibition on unsafe Prisma raw-query APIs remains unchanged, including test source scanning.

Fixture data is seeded with parameterized SQL so copied tables retain their actual migrated enum types; no parallel enum definitions or test-only application casts are introduced.
